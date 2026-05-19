from __future__ import annotations

import json
from pathlib import Path

from .types import ResumeConfig


def load_resume_config(config_path: str | Path) -> ResumeConfig:
    abs_path = Path(config_path).resolve()
    try:
        raw = abs_path.read_text(encoding="utf-8")
    except OSError as err:
        hint = (
            f"Missing resume config at {abs_path}. Create it from resume.config.json.example "
            f"(repo root): cp resume.config.json.example resume.config.json"
        )
        raise RuntimeError(hint) from err
    return ResumeConfig.model_validate(json.loads(raw))


def read_resume_config_text(config_path: str | Path) -> str | None:
    try:
        return Path(config_path).read_text(encoding="utf-8")
    except OSError:
        return None
