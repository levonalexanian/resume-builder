from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ResumeConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(min_length=1)
    phone: str | None = None
    email: str = Field(min_length=1)
    linkedinUrl: str = Field(min_length=1)
    linkedinDisplay: str | None = None
    githubUrl: str = Field(min_length=1)
    githubDisplay: str | None = None
    skillsLatex: str | None = None
