from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import User
from .types import ResumeConfig


async def load_resume_config(session: AsyncSession, user_id: uuid.UUID) -> ResumeConfig:
    row = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if row is None:
        raise RuntimeError(f"User not found in database: {user_id}")
    return ResumeConfig.model_validate(
        {
            "name": row.name,
            "phone": row.phone,
            "email": row.email or "",
            "linkedinUrl": row.linkedin_url or "",
            "linkedinDisplay": row.linkedin_display,
            "githubUrl": row.github_url or "",
            "githubDisplay": row.github_display,
            "skillsLatex": row.skills_latex,
        }
    )
