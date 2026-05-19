from __future__ import annotations

import re

_STOP_WORDS = frozenset(
    [
        "the", "and", "for", "with", "you", "your", "our", "are", "will",
        "this", "that", "from", "into", "have", "has", "had", "their",
        "they", "them", "who", "what", "when", "where", "why", "how",
        "about", "all", "any", "can", "may", "able", "work", "working",
    ]
)

_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
_WHITESPACE_RE = re.compile(r"\s+")
_LEADING_TRAILING_UNDERSCORE_RE = re.compile(r"^_+|_+$")


def tokenize(text: str) -> list[str]:
    lowered = text.lower()
    spaced = _NON_ALNUM_RE.sub(" ", lowered)
    tokens = [t.strip() for t in spaced.split()]
    return [t for t in tokens if len(t) >= 3 and t not in _STOP_WORDS]


def normalize_company_name(name: str) -> str:
    return _WHITESPACE_RE.sub(" ", name).strip()


def safe_slug(value: str) -> str:
    return _NON_ALNUM_RE.sub("", value.lower())[:40]


def safe_basename(value: str) -> str:
    lowered = value.strip().lower()
    underscored = _NON_ALNUM_RE.sub("_", lowered)
    trimmed = _LEADING_TRAILING_UNDERSCORE_RE.sub("", underscored)
    return trimmed[:48]
