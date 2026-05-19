from __future__ import annotations

from pathlib import Path


def ensure_dir(dir_path: str | Path) -> Path:
    p = Path(dir_path)
    p.mkdir(parents=True, exist_ok=True)
    return p


def exists(p: str | Path) -> bool:
    return Path(p).exists()
