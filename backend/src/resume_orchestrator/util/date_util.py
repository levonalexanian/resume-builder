from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

_MONTHS: dict[str, int] = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

_MONTH_YEAR_RE = re.compile(r"([A-Za-z]+)\.?\s*(\d{4})")
_YEAR_ONLY_RE = re.compile(r"\b(\d{4})\b")
_ONGOING_RE = re.compile(r"\b(present|current|now|ongoing)\b", re.IGNORECASE)
_DASH_RE = re.compile(r"[–—-]+")
_RANGE_SEP_RE = re.compile(r"\s+-\s+")


@dataclass(slots=True, frozen=True)
class ParsedDate:
    year: int
    month: int


@dataclass(slots=True, frozen=True)
class ParsedRange:
    start: ParsedDate | None
    end: ParsedDate | None
    ongoing: bool


def _normalize_month_token(tok: str) -> int | None:
    key = tok.lower().replace(".", "")
    return _MONTHS.get(key)


def parse_loose_date(text: str | None) -> ParsedDate | None:
    if not text:
        return None
    m = _MONTH_YEAR_RE.search(text)
    if m:
        month = _normalize_month_token(m.group(1))
        try:
            year = int(m.group(2))
        except ValueError:
            year = None
        if month is not None and year is not None:
            return ParsedDate(year=year, month=month)
    ym = _YEAR_ONLY_RE.search(text)
    if ym:
        return ParsedDate(year=int(ym.group(1)), month=1)
    return None


def parse_date_range(text: str | None) -> ParsedRange:
    if not text:
        return ParsedRange(start=None, end=None, ongoing=False)
    normalized = _DASH_RE.sub(" - ", text)
    ongoing = bool(_ONGOING_RE.search(normalized))
    parts = [p.strip() for p in _RANGE_SEP_RE.split(normalized) if p.strip()]
    if not parts:
        return ParsedRange(start=None, end=None, ongoing=ongoing)
    start = parse_loose_date(parts[0])
    end = None if ongoing else parse_loose_date(parts[-1])
    return ParsedRange(start=start, end=end, ongoing=ongoing)


def months_since(date: ParsedDate, now: datetime | None = None) -> int:
    ref = now or datetime.now()
    y_delta = ref.year - date.year
    m_delta = ref.month - date.month
    return y_delta * 12 + m_delta


def freshness_score(duration_text: str | None, now: datetime | None = None) -> float:
    """Map a parsed duration string to a freshness score in [0,1].

    1.0 = ongoing or ended within the last 6 months; decays linearly to 0 by 60
    months (5 years). Unknown durations score 0.
    """
    rng = parse_date_range(duration_text)
    if rng.ongoing:
        return 1.0
    ref = rng.end or rng.start
    if ref is None:
        return 0.0
    months = months_since(ref, now)
    if months <= 6:
        return 1.0
    if months >= 60:
        return 0.0
    return 1.0 - (months - 6) / 54
