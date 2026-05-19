from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

_TRUTHY = {"1", "true", "yes", "on"}
_ALLOWED_PROVIDERS = {"openai", "anthropic", "google"}

DraftProvider = Literal["openai", "anthropic", "google"]


@dataclass(slots=True)
class ResumeEnv:
    PERPLEXITY_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    GOOGLE_GENERATIVE_AI_API_KEY: str | None = None
    RESUME_USE_PERPLEXITY_RESEARCH: bool = False
    RESUME_USE_LLM_RERANK: bool = False
    RESUME_USE_LLM_DRAFT: bool = False
    RESUME_DRAFT_PROVIDER: DraftProvider | None = None


def parse_boolean(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in _TRUTHY


def _parse_dotenv(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        eq = line.find("=")
        if eq < 0:
            continue
        key = line[:eq].strip()
        value = line[eq + 1 :].strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        out[key] = value
    return out


def load_dotenv_from_root(repo_root: str | Path) -> dict[str, str]:
    candidate = Path(repo_root) / ".env"
    try:
        return _parse_dotenv(candidate.read_text(encoding="utf-8"))
    except OSError:
        return {}


def load_resume_env(repo_root: str | Path) -> ResumeEnv:
    file_env = load_dotenv_from_root(repo_root)

    def get(key: str) -> str | None:
        return os.environ.get(key) or file_env.get(key) or None

    provider_raw = (get("RESUME_DRAFT_PROVIDER") or "").strip().lower()
    provider: DraftProvider | None = (
        provider_raw if provider_raw in _ALLOWED_PROVIDERS else None  # type: ignore[assignment]
    )

    return ResumeEnv(
        PERPLEXITY_API_KEY=get("PERPLEXITY_API_KEY"),
        OPENAI_API_KEY=get("OPENAI_API_KEY"),
        ANTHROPIC_API_KEY=get("ANTHROPIC_API_KEY"),
        GOOGLE_GENERATIVE_AI_API_KEY=get("GOOGLE_GENERATIVE_AI_API_KEY"),
        RESUME_USE_PERPLEXITY_RESEARCH=parse_boolean(get("RESUME_USE_PERPLEXITY_RESEARCH")),
        RESUME_USE_LLM_RERANK=parse_boolean(get("RESUME_USE_LLM_RERANK")),
        RESUME_USE_LLM_DRAFT=parse_boolean(get("RESUME_USE_LLM_DRAFT")),
        RESUME_DRAFT_PROVIDER=provider,
    )


class MissingApiKeyError(Exception):
    def __init__(self, toggle: str, key: str) -> None:
        super().__init__(
            f"{toggle} is enabled but {key} is not set in repo-root .env or environment. "
            f"Either set the key or disable the toggle."
        )
        self.toggle = toggle
        self.key = key
