from __future__ import annotations

import re
from pathlib import Path

import frontmatter

from ..util.text_util import safe_slug
from ..util.time_util import now_iso
from .md_parse import (
    extract_tags_from_text,
    parse_markdown_bullets,
    parse_markdown_heading_title,
    parse_metadata_lines,
)
from .types import SourceDoc, SourcesIndex

_MD_RE = re.compile(r"\.md$", re.IGNORECASE)
_EXAMPLE_MD_RE = re.compile(r"\.example\.md$", re.IGNORECASE)
_ID_SAFE_RE = re.compile(r"[^a-zA-Z0-9._/\-]+")


def _make_id(rel: str) -> str:
    no_ext = _MD_RE.sub("", rel)
    return _ID_SAFE_RE.sub("-", no_ext).lower()


def _classify_kind(rel_path: str) -> str:
    if rel_path.startswith("experience/"):
        return "experience"
    if rel_path.startswith("education/"):
        return "education"
    if rel_path.startswith("projects/"):
        return "project"
    return "other"


def _group_name_from_path(rel_path: str) -> str:
    parts = rel_path.split("/")
    if len(parts) < 2:
        return parts[0] if parts else "unknown"
    return parts[1] or "unknown"


def _iter_markdown(root: Path) -> list[str]:
    matches: list[str] = []
    for subdir in ("experience", "education", "projects"):
        base = root / subdir
        if not base.is_dir():
            continue
        for path in base.rglob("*.md"):
            rel = path.relative_to(root).as_posix()
            if _EXAMPLE_MD_RE.search(rel):
                continue
            matches.append(rel)
    matches.sort()
    return matches


def index_sources(root: str | Path) -> SourcesIndex:
    root_abs = Path(root).resolve()
    docs: list[SourceDoc] = []

    for rel in _iter_markdown(root_abs):
        abs_path = root_abs / rel
        raw = abs_path.read_text(encoding="utf-8")

        post = frontmatter.loads(raw)
        content = post.content

        title = parse_markdown_heading_title(content) or Path(rel).stem
        kind = _classify_kind(rel)
        meta = parse_metadata_lines(content)
        bullets = parse_markdown_bullets(content)

        group_raw = meta.get("company") or meta.get("school") or _group_name_from_path(rel)
        group = group_raw
        group_key = safe_slug(group_raw) or _group_name_from_path(rel)

        tag_source = "\n".join([rel, title, *bullets, content])
        tags = extract_tags_from_text(tag_source)

        docs.append(
            SourceDoc(
                id=_make_id(rel),
                path=rel,
                kind=kind,  # type: ignore[arg-type]
                group=group,
                groupKey=group_key,
                title=title,
                meta=meta,
                tags=tags,
                bullets=bullets,
                text=content,
            )
        )

    return SourcesIndex(schemaVersion=1, generatedAt=now_iso(), docs=docs)
