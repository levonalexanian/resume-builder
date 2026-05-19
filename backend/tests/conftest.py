from __future__ import annotations

import os
import subprocess
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from resume_orchestrator.db.models import Education, Experience, Project, User

BACKEND_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_ROOT.parent


@pytest.fixture(scope="session")
def repo_root() -> Path:
    """Root used to find templates/, scripts/, and the LaTeX toolchain."""
    return REPO_ROOT


def _split_db_url(url: str) -> tuple[str, str]:
    head, _, db = url.rpartition("/")
    return head, db


@pytest.fixture(scope="session")
def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL is not set; DB-backed tests require Postgres.")
    head, _db = _split_db_url(url)
    return f"{head}/resume_test"


@pytest_asyncio.fixture(scope="session")
async def _prepared_database(database_url: str) -> AsyncIterator[str]:
    base_url = os.environ["DATABASE_URL"]
    head, _ = _split_db_url(base_url)
    admin_url = f"{head}/postgres"
    admin_engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
    async with admin_engine.connect() as conn:
        from sqlalchemy import text

        await conn.execute(text("DROP DATABASE IF EXISTS resume_test"))
        await conn.execute(text("CREATE DATABASE resume_test"))
    await admin_engine.dispose()

    prev = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        prisma_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
        subprocess.run(
            ["npx", "prisma", "migrate", "deploy"],
            cwd=REPO_ROOT,
            env={**os.environ, "PRISMA_DATABASE_URL": prisma_url},
            check=True,
        )
        yield database_url
    finally:
        if prev is not None:
            os.environ["DATABASE_URL"] = prev


@pytest_asyncio.fixture()
async def db_session(_prepared_database: str) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(_prepared_database)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        try:
            yield session
        finally:
            await session.rollback()
            from sqlalchemy import text

            await session.execute(
                text("TRUNCATE users, experiences, educations, projects, runs CASCADE")
            )
            await session.commit()
    await engine.dispose()


_SAMPLE_EXPERIENCE = {
    ("acme", "overview"): (
        "## Acme Robotics\n\n"
        "- **Position:** Software Engineer\n"
        "- **Location:** Remote\n"
        "- **Duration:** January 2024 – Present\n"
    ),
    ("acme", "fullstack"): (
        "## Fullstack Development\n\n"
        "### What I worked on\n\n"
        "- Built a TypeScript/React service with GraphQL and SQL backends\n"
        "- Owned the Prisma data model and helped run AWS deploys\n"
    ),
    ("acme", "embedded"): (
        "## Embedded Systems\n\n"
        "### What I worked on\n\n"
        "- STM32 firmware with FreeRTOS over CAN bus\n"
    ),
}

_SAMPLE_EDUCATION = {
    ("undergrad", "overview"): (
        "## Test University\n\n"
        "- **Diploma:** B.A.Sc. Computer Engineering\n"
        "- **Location:** Test City\n"
        "- **Duration:** September 2020 – April 2024\n"
        "- **GPA:** 4.0\n"
    ),
}

_SAMPLE_PROJECTS: dict[tuple[str, str], str] = {}


@pytest_asyncio.fixture()
async def seeded_user(db_session: AsyncSession) -> User:
    user = User(
        user_id="testuser",
        name="Test User",
        phone="(555) 555-5555",
        email="test@example.com",
        linkedin_url="https://www.linkedin.com/in/testuser/",
        linkedin_display="linkedin.com/in/testuser",
        github_url="https://github.com/testuser",
        github_display="github.com/testuser",
        skills_latex="\\textit{[Technical Skills section placeholder]}",
    )
    db_session.add(user)
    await db_session.flush()

    for (slug, file_slug), body in _SAMPLE_EXPERIENCE.items():
        db_session.add(
            Experience(
                user_id=user.id,
                company_slug=slug,
                file_slug=file_slug,
                body_md=body,
            )
        )
    for (slug, file_slug), body in _SAMPLE_EDUCATION.items():
        db_session.add(
            Education(user_id=user.id, slug=slug, file_slug=file_slug, body_md=body)
        )
    for (slug, file_slug), body in _SAMPLE_PROJECTS.items():
        db_session.add(
            Project(user_id=user.id, slug=slug, file_slug=file_slug, body_md=body)
        )
    await db_session.commit()
    return user


@pytest.fixture()
def user_uuid(seeded_user: User) -> uuid.UUID:
    return seeded_user.id
