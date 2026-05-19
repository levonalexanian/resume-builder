from __future__ import annotations

import os
import shutil
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from resume_orchestrator.db.models import Education, Experience, Project, User

REAL_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _has_real_markdown(root: Path) -> bool:
    for subdir in ("experience", "education", "projects"):
        for md in (root / subdir).rglob("*.md"):
            if ".example.md" not in md.name:
                return True
    return False


def _materialize_examples(src_root: Path, dest_root: Path) -> None:
    for subdir in ("experience", "education", "projects"):
        for example in (src_root / subdir).rglob("*.example.md"):
            rel = example.relative_to(src_root)
            renamed = rel.with_name(rel.name.replace(".example.md", ".md"))
            dest = dest_root / renamed
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(example, dest)


@pytest.fixture(scope="session")
def repo_root(tmp_path_factory: pytest.TempPathFactory) -> Path:
    if _has_real_markdown(REAL_REPO_ROOT):
        return REAL_REPO_ROOT

    staged = tmp_path_factory.mktemp("resume-repo")
    for entry in ("templates", "scripts", "resume.config.json.example"):
        src = REAL_REPO_ROOT / entry
        if not src.exists():
            continue
        dest = staged / entry
        if src.is_dir():
            shutil.copytree(src, dest)
        else:
            shutil.copyfile(src, dest)
    config_example = staged / "resume.config.json.example"
    if config_example.exists():
        shutil.copyfile(config_example, staged / "resume.config.json")
    _materialize_examples(REAL_REPO_ROOT, staged)
    return staged


def _split_db_url(url: str) -> tuple[str, str]:
    head, _, db = url.rpartition("/")
    return head, db


@pytest.fixture(scope="session")
def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL is not set; DB-backed tests require Postgres.")
    head, _db = _split_db_url(url)
    return f"{head}/resume_test"


@pytest_asyncio.fixture(scope="session")
async def _prepared_database(database_url: str) -> AsyncIterator[str]:
    base_url = os.environ["DATABASE_URL"]
    head, _ = _split_db_url(base_url)
    admin_url = f"{head}/postgres"
    admin_engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
    async with admin_engine.connect() as conn:
        from sqlalchemy import text

        await conn.execute(text("DROP DATABASE IF EXISTS resume_test"))
        await conn.execute(text("CREATE DATABASE resume_test"))
    await admin_engine.dispose()

    prev = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
        cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
        command.upgrade(cfg, "head")
        yield database_url
    finally:
        if prev is not None:
            os.environ["DATABASE_URL"] = prev


@pytest_asyncio.fixture()
async def db_session(_prepared_database: str) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(_prepared_database)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        try:
            yield session
        finally:
            await session.rollback()
            # truncate user-owned content to keep tests independent
            from sqlalchemy import text

            await session.execute(
                text("TRUNCATE users, experiences, educations, projects, runs CASCADE")
            )
            await session.commit()
    await engine.dispose()


@pytest_asyncio.fixture()
async def seeded_user(repo_root: Path, db_session: AsyncSession) -> User:
    """Seed a test user populated from the repo_root markdown / config."""
    import json

    config_path = repo_root / "resume.config.json"
    if not config_path.exists():
        config_path = repo_root / "resume.config.json.example"
    cfg = json.loads(config_path.read_text(encoding="utf-8"))

    user = User(
        user_id="testuser",
        name=cfg.get("name") or "testuser",
        phone=cfg.get("phone"),
        email=cfg.get("email"),
        linkedin_url=cfg.get("linkedinUrl"),
        linkedin_display=cfg.get("linkedinDisplay"),
        github_url=cfg.get("githubUrl"),
        github_display=cfg.get("githubDisplay"),
        skills_latex=cfg.get("skillsLatex"),
    )
    db_session.add(user)
    await db_session.flush()

    def _seed(folder: str, model: type, slug_field: str) -> None:
        base = repo_root / folder
        if not base.is_dir():
            return
        for md in sorted(base.rglob("*.md")):
            if md.name.endswith(".example.md"):
                continue
            rel = md.relative_to(base)
            parts = rel.as_posix().split("/")
            if len(parts) != 2:
                continue
            slug, filename = parts
            file_slug = filename[:-3]
            db_session.add(
                model(
                    user_id=user.id,
                    body_md=md.read_text(encoding="utf-8"),
                    file_slug=file_slug,
                    **{slug_field: slug},
                )
            )

    _seed("experience", Experience, "company_slug")
    _seed("education", Education, "slug")
    _seed("projects", Project, "slug")
    await db_session.commit()
    return user


@pytest.fixture()
def user_uuid(seeded_user: User) -> uuid.UUID:
    return seeded_user.id
