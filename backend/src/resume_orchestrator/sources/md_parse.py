from __future__ import annotations

import re

_META_LINE_RE = re.compile(r"^\s*-\s*\*\*([^*:]+)(?::\*\*|\*\*:)\s*(.+?)\s*$")
_HEADING_RE = re.compile(r"^\s*#{1,3}\s+(.+?)\s*$")
_BULLET_RE = re.compile(r"^\s*[-*]\s+(.+?)\s*$")

_PSEUDO_BULLET_PATTERNS = [
    re.compile(r"^\*\*[^*:]+:\*\*\s+"),
    re.compile(r"^\*\*[^*]+\*\*:\s+"),
    re.compile(r"^\[[^\]]+\]\([^)]+\)\s*$"),
    re.compile(r"^email:\s*", re.IGNORECASE),
    re.compile(r"^phone:\s*", re.IGNORECASE),
]


def parse_markdown_heading_title(markdown: str) -> str | None:
    for line in markdown.splitlines():
        m = _HEADING_RE.match(line)
        if m:
            return m.group(1)
    return None


def parse_metadata_lines(markdown: str) -> dict[str, str]:
    meta: dict[str, str] = {}
    for line in markdown.splitlines():
        m = _META_LINE_RE.match(line)
        if not m:
            continue
        key = m.group(1).strip().lower()
        val = m.group(2).strip()
        if key in ("position", "role"):
            meta["role"] = val
        elif key == "location":
            meta["location"] = val
        elif key in ("duration", "dates"):
            meta["duration"] = val
        elif key == "company":
            meta["company"] = val
        elif key == "school":
            meta["school"] = val
        elif key in ("diploma", "degree"):
            meta["diploma"] = val
        elif key == "gpa":
            meta["gpa"] = val
        else:
            meta[key] = val
    return meta


def _looks_like_pseudo_bullet(text: str) -> bool:
    return any(p.search(text) for p in _PSEUDO_BULLET_PATTERNS)


def parse_markdown_bullets(markdown: str) -> list[str]:
    bullets: list[str] = []
    for line in markdown.splitlines():
        m = _BULLET_RE.match(line)
        if not m:
            continue
        body = m.group(1)
        if _looks_like_pseudo_bullet(body):
            continue
        bullets.append(body)
    return bullets


_TAG_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("typescript", re.compile(r"\btypescript\b|\btsx?\b", re.IGNORECASE)),
    ("javascript", re.compile(r"\bjavascript\b|\bjs\b", re.IGNORECASE)),
    ("react", re.compile(r"\breact\b", re.IGNORECASE)),
    ("node", re.compile(r"\bnode\.?js\b|\bnode\b", re.IGNORECASE)),
    ("graphql", re.compile(r"\bgraphql\b", re.IGNORECASE)),
    ("sql", re.compile(r"\bsql\b|\bmysql\b|\bpostgres\b|\bpostgresql\b|\bsqlite\b", re.IGNORECASE)),
    ("aws", re.compile(r"\baws\b|\bsagemaker\b|\bs3\b|\bec2\b", re.IGNORECASE)),
    ("prisma", re.compile(r"\bprisma\b", re.IGNORECASE)),
    ("python", re.compile(r"\bpython\b", re.IGNORECASE)),
    ("cpp", re.compile(r"\bc\+\+|\bcpp\b", re.IGNORECASE)),
    ("stm32", re.compile(r"\bstm32\b", re.IGNORECASE)),
    ("freertos", re.compile(r"\bfreertos\b", re.IGNORECASE)),
    ("rtos", re.compile(r"\brtos\b", re.IGNORECASE)),
    ("cbor", re.compile(r"\bcbor\b", re.IGNORECASE)),
    ("can", re.compile(r"\bcan\b\s+bus|\bcanbus\b", re.IGNORECASE)),
    ("spi", re.compile(r"\bspi\b", re.IGNORECASE)),
    ("i2c", re.compile(r"\bi2c\b", re.IGNORECASE)),
    ("mqtt", re.compile(r"\bmqtt\b", re.IGNORECASE)),
    ("embedded", re.compile(r"\bembedded\b", re.IGNORECASE)),
    ("firmware", re.compile(r"\bfirmware\b", re.IGNORECASE)),
    ("fullstack", re.compile(r"\bfull[-\s]?stack\b", re.IGNORECASE)),
    ("frontend", re.compile(r"\bfrontend\b|\bfront[-\s]end\b", re.IGNORECASE)),
    ("backend", re.compile(r"\bbackend\b|\bback[-\s]end\b", re.IGNORECASE)),
    ("ai", re.compile(r"\bai\b|\bartificial\s+intelligence\b", re.IGNORECASE)),
    ("ml", re.compile(r"\bmachine\s+learning\b|\bml\b", re.IGNORECASE)),
    ("cv", re.compile(r"\bcomputer\s+vision\b", re.IGNORECASE)),
    ("robotics", re.compile(r"\brobotics?\b", re.IGNORECASE)),
    ("leadership", re.compile(r"\blead\b|\bleader\b|\bmentor\b|\bownership\b", re.IGNORECASE)),
]


def extract_tags_from_text(text: str) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()
    for tag, pattern in _TAG_PATTERNS:
        if tag in seen:
            continue
        if pattern.search(text):
            tags.append(tag)
            seen.add(tag)
    return tags
