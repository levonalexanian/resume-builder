from __future__ import annotations

import re
import uuid

import frontmatter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Education, Experience, Project
from ..util.text_util import safe_slug
from ..util.time_util import now_iso
from .md_parse import (
    extract_tags_from_text,
    parse_markdown_bullets,
    parse_markdown_heading_title,
    parse_metadata_lines,
)
from .types import SourceDoc, SourcesIndex

_ID_SAFE_RE = re.compile(r"[^a-zA-Z0-9._/\-]+")


def _make_id(rel: str) -> str:
    no_ext = rel[:-3] if rel.endswith(".md") else rel
    return _ID_SAFE_RE.sub("-", no_ext).lower()


def _build_doc(rel_path: str, kind: str, raw: str, group_dir: str) -> SourceDoc:
    post = frontmatter.loads(raw)
    content = post.content

    title = parse_markdown_heading_title(content) or rel_path.rsplit("/", 1)[-1].removesuffix(".md")
    meta = parse_metadata_lines(content)
    bullets = parse_markdown_bullets(content)

    group_raw = meta.get("company") or meta.get("school") or group_dir
    group = group_raw
    group_key = safe_slug(group_raw) or group_dir

    tag_source = "\n".join([rel_path, title, *bullets, content])
    tags = extract_tags_from_text(tag_source)

    return SourceDoc(
        id=_make_id(rel_path),
        path=rel_path,
        kind=kind,  # type: ignore[arg-type]
        group=group,
        groupKey=group_key,
        title=title,
        meta=meta,
        tags=tags,
        bullets=bullets,
        text=content,
    )


async def index_sources(session: AsyncSession, user_id: uuid.UUID) -> SourcesIndex:
    docs: list[SourceDoc] = []

    exp_rows = (
        await session.execute(
            select(Experience)
            .where(Experience.user_id == user_id)
            .order_by(Experience.company_slug, Experience.file_slug)
        )
    ).scalars().all()
    for row in exp_rows:
        rel = f"experience/{row.company_slug}/{row.file_slug}.md"
        docs.append(_build_doc(rel, "experience", row.body_md, row.company_slug))

    edu_rows = (
        await session.execute(
            select(Education)
            .where(Education.user_id == user_id)
            .order_by(Education.slug, Education.file_slug)
        )
    ).scalars().all()
    for row in edu_rows:
        rel = f"education/{row.slug}/{row.file_slug}.md"
        docs.append(_build_doc(rel, "education", row.body_md, row.slug))

    proj_rows = (
        await session.execute(
            select(Project)
            .where(Project.user_id == user_id)
            .order_by(Project.slug, Project.file_slug)
        )
    ).scalars().all()
    for row in proj_rows:
        rel = f"projects/{row.slug}/{row.file_slug}.md"
        docs.append(_build_doc(rel, "project", row.body_md, row.slug))

    return SourcesIndex(schemaVersion=1, generatedAt=now_iso(), docs=docs)


async def get_body_md_by_path(
    session: AsyncSession, user_id: uuid.UUID, rel_path: str
) -> str | None:
    parts = rel_path.split("/")
    if len(parts) != 3 or not parts[2].endswith(".md"):
        return None
    kind, slug, filename = parts
    file_slug = filename[:-3]
    if kind == "experience":
        row = (
            await session.execute(
                select(Experience).where(
                    Experience.user_id == user_id,
                    Experience.company_slug == slug,
                    Experience.file_slug == file_slug,
                )
            )
        ).scalar_one_or_none()
        return row.body_md if row else None
    if kind == "education":
        row = (
            await session.execute(
                select(Education).where(
                    Education.user_id == user_id,
                    Education.slug == slug,
                    Education.file_slug == file_slug,
                )
            )
        ).scalar_one_or_none()
        return row.body_md if row else None
    if kind == "projects":
        row = (
            await session.execute(
                select(Project).where(
                    Project.user_id == user_id,
                    Project.slug == slug,
                    Project.file_slug == file_slug,
                )
            )
        ).scalar_one_or_none()
        return row.body_md if row else None
    return None
