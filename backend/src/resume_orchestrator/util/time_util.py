from __future__ import annotations

from datetime import datetime, timezone


def now_iso() -> str:
    """UTC ISO timestamp matching JS `new Date().toISOString()` (3-digit millis + Z)."""
    now = datetime.now(timezone.utc)
    millis = now.microsecond // 1000
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{millis:03d}Z"


def now_date_yyyymmdd(d: datetime | None = None) -> str:
    ref = d or datetime.now()
    return ref.strftime("%Y%m%d")


def now_run_id(date: datetime | None = None) -> str:
    """Run ID slug in local time, matching TS `nowRunId`: YYYYMMDDHHMM."""
    ref = date or datetime.now()
    return ref.strftime("%Y%m%d%H%M")
