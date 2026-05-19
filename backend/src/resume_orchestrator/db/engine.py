from __future__ import annotations

import os

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Run inside the dev container (docker-compose "
            "exports it) or set it in your shell, e.g. "
            "postgresql+asyncpg://resume:resume@postgres:5432/resume"
        )
    return url


def create_engine_from_env(*, echo: bool = False) -> AsyncEngine:
    return create_async_engine(get_database_url(), echo=echo, future=True)
