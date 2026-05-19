from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Kind = Literal["experience", "education", "project"]


class RankedBullet(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(min_length=1)
    evidence: list[str] = Field(min_length=1)
    relevancy: float
    freshness: float
    score: float


class RankedEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    kind: Kind
    group: str = Field(min_length=1)
    title: str = Field(min_length=1)
    role: str | None = None
    location: str | None = None
    duration: str | None = None
    diploma: str | None = None
    gpa: str | None = None
    relevancy: float
    freshness: float
    score: float
    evidence: list[str] = Field(default_factory=list)
    bullets: list[RankedBullet] = Field(default_factory=list)


class RankedJob(BaseModel):
    model_config = ConfigDict(extra="ignore")

    path: str = Field(min_length=1)
    company: str | None = None
    focus: str | None = None


class RankedWeights(BaseModel):
    model_config = ConfigDict(extra="ignore")

    relevancy: float
    freshness: float


class RankedSources(BaseModel):
    model_config = ConfigDict(extra="ignore")

    schemaVersion: Literal[1] = 1
    generatedAt: str = Field(min_length=1)
    job: RankedJob
    weights: RankedWeights
    experience: list[RankedEntry] = Field(default_factory=list)
    education: list[RankedEntry] = Field(default_factory=list)
    projects: list[RankedEntry] = Field(default_factory=list)
