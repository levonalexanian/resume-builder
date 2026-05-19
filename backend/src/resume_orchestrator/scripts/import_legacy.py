from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.engine import create_engine_from_env
from ..db.models import Education, Experience, Project, User
from ..db.session import async_session_factory

_USER_SLUG_RE = re.compile(r"^[a-z0-9_-]+$")


@dataclass(slots=True)
class ImportPlan:
    user_action: str = "noop"
    experiences: list[tuple[str, str]] = field(default_factory=list)
    educations: list[tuple[str, str]] = field(default_factory=list)
    projects: list[tuple[str, str]] = field(default_factory=list)
    skipped_examples: list[str] = field(default_factory=list)


def _iter_content_files(base: Path) -> list[Path]:
    if not base.is_dir():
        return []
    return sorted(p for p in base.rglob("*.md") if p.is_file())


def _is_example(path: Path) -> bool:
    return path.name.endswith(".example.md")


def _read_config(repo_root: Path) -> dict[str, str | None]:
    config_path = repo_root / "resume.config.json"
    if not config_path.exists():
        example = repo_root / "resume.config.json.example"
        if not example.exists():
            raise FileNotFoundError(
                f"Neither {config_path} nor {example} exists. Cannot import user."
            )
        config_path = example
    return json.loads(config_path.read_text(encoding="utf-8"))


async def _upsert_user(
    session: AsyncSession, user_id: str, config: dict[str, str | None]
) -> tuple[User, str]:
    result = await session.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    fields = {
        "name": config.get("name") or user_id,
        "phone": config.get("phone"),
        "email": config.get("email"),
        "linkedin_url": config.get("linkedinUrl"),
        "linkedin_display": config.get("linkedinDisplay"),
        "github_url": config.get("githubUrl"),
        "github_display": config.get("githubDisplay"),
        "skills_latex": config.get("skillsLatex"),
    }
    if user is None:
        user = User(user_id=user_id, **fields)
        session.add(user)
        await session.flush()
        return user, "created"
    changed = False
    for k, v in fields.items():
        if getattr(user, k) != v:
            setattr(user, k, v)
            changed = True
    return user, "updated" if changed else "unchanged"


async def _upsert_row(
    session: AsyncSession,
    model: type,
    where: dict[str, object],
    body_md: str,
) -> str:
    stmt = select(model)
    for k, v in where.items():
        stmt = stmt.where(getattr(model, k) == v)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is None:
        session.add(model(**where, body_md=body_md))
        return "created"
    if existing.body_md != body_md:
        existing.body_md = body_md
        return "updated"
    return "unchanged"


def _classify_paths(repo_root: Path) -> tuple[list[Path], list[Path], list[Path], list[Path]]:
    exp_files = _iter_content_files(repo_root / "experience")
    edu_files = _iter_content_files(repo_root / "education")
    proj_files = _iter_content_files(repo_root / "projects")
    skipped = [
        p for p in (*exp_files, *edu_files, *proj_files) if _is_example(p)
    ]
    exp_keep = [p for p in exp_files if not _is_example(p)]
    edu_keep = [p for p in edu_files if not _is_example(p)]
    proj_keep = [p for p in proj_files if not _is_example(p)]
    return exp_keep, edu_keep, proj_keep, skipped


async def import_legacy(
    *, repo_root: Path, user_id: str, dry_run: bool
) -> ImportPlan:
    if not _USER_SLUG_RE.match(user_id):
        raise ValueError(f"Invalid user_id slug: {user_id!r} (expected [a-z0-9_-]+)")

    config = _read_config(repo_root)
    exp_files, edu_files, proj_files, skipped = _classify_paths(repo_root)

    plan = ImportPlan(
        skipped_examples=[p.relative_to(repo_root).as_posix() for p in skipped]
    )

    engine = create_engine_from_env()
    factory = async_session_factory(engine)

    counts = {"created": 0, "updated": 0, "unchanged": 0}

    try:
        async with factory() as session:
            user, user_action = await _upsert_user(session, user_id, config)
            plan.user_action = user_action

            for path in exp_files:
                rel = path.relative_to(repo_root / "experience").as_posix()
                parts = rel.split("/")
                if len(parts) != 2:
                    continue
                company_slug, filename = parts
                file_slug = filename[:-3] if filename.endswith(".md") else filename
                body_md = path.read_text(encoding="utf-8")
                plan.experiences.append((company_slug, file_slug))
                if not dry_run:
                    action = await _upsert_row(
                        session,
                        Experience,
                        {
                            "user_id": user.id,
                            "company_slug": company_slug,
                            "file_slug": file_slug,
                        },
                        body_md,
                    )
                    counts[action] = counts.get(action, 0) + 1

            for path in edu_files:
                rel = path.relative_to(repo_root / "education").as_posix()
                parts = rel.split("/")
                if len(parts) != 2:
                    continue
                slug, filename = parts
                file_slug = filename[:-3] if filename.endswith(".md") else filename
                body_md = path.read_text(encoding="utf-8")
                plan.educations.append((slug, file_slug))
                if not dry_run:
                    action = await _upsert_row(
                        session,
                        Education,
                        {"user_id": user.id, "slug": slug, "file_slug": file_slug},
                        body_md,
                    )
                    counts[action] = counts.get(action, 0) + 1

            for path in proj_files:
                rel = path.relative_to(repo_root / "projects").as_posix()
                parts = rel.split("/")
                if len(parts) != 2:
                    continue
                slug, filename = parts
                file_slug = filename[:-3] if filename.endswith(".md") else filename
                body_md = path.read_text(encoding="utf-8")
                plan.projects.append((slug, file_slug))
                if not dry_run:
                    action = await _upsert_row(
                        session,
                        Project,
                        {"user_id": user.id, "slug": slug, "file_slug": file_slug},
                        body_md,
                    )
                    counts[action] = counts.get(action, 0) + 1

            if dry_run:
                await session.rollback()
            else:
                await session.commit()
    finally:
        await engine.dispose()

    print(f"user {user_id}: {plan.user_action}")
    print(f"experiences planned: {len(plan.experiences)}")
    print(f"educations planned:  {len(plan.educations)}")
    print(f"projects planned:    {len(plan.projects)}")
    if plan.skipped_examples:
        print(f"skipped *.example.md: {len(plan.skipped_examples)}")
    if not dry_run:
        print(
            f"db rows: created={counts['created']} updated={counts['updated']} "
            f"unchanged={counts['unchanged']}"
        )
    else:
        print("[dry-run] no rows written")

    return plan


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import legacy filesystem content into Postgres for a single user."
    )
    parser.add_argument("--repo-root", default=".", type=Path)
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args(argv)


async def _amain(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    repo_root = args.repo_root.resolve()
    try:
        await import_legacy(
            repo_root=repo_root, user_id=args.user_id, dry_run=args.dry_run
        )
    except (ValueError, FileNotFoundError, RuntimeError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(_amain(argv))


if __name__ == "__main__":
    raise SystemExit(main())
