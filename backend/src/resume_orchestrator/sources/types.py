from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Kind = Literal["experience", "education", "project", "other"]


class SourceDoc(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    path: str = Field(min_length=1)
    kind: Kind
    group: str = Field(min_length=1)
    groupKey: str = Field(min_length=1)
    title: str = Field(min_length=1)
    meta: dict[str, str] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    bullets: list[str] = Field(default_factory=list)
    text: str = ""


class SourcesIndex(BaseModel):
    model_config = ConfigDict(extra="ignore")

    schemaVersion: Literal[1] = 1
    generatedAt: str = Field(min_length=1)
    docs: list[SourceDoc]


class SelectedBullet(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(min_length=1)
    evidence: list[str] = Field(min_length=1)
    score: float


class SelectedExperience(BaseModel):
    model_config = ConfigDict(extra="ignore")

    company: str = Field(min_length=1)
    role: str | None = None
    location: str | None = None
    duration: str | None = None
    bullets: list[SelectedBullet] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)


class SelectedEducation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    school: str = Field(min_length=1)
    diploma: str | None = None
    location: str | None = None
    duration: str | None = None
    gpa: str | None = None
    bullets: list[SelectedBullet] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)


class SelectedJob(BaseModel):
    model_config = ConfigDict(extra="ignore")

    path: str = Field(min_length=1)
    company: str | None = None
    focus: str | None = None


class SelectedSources(BaseModel):
    model_config = ConfigDict(extra="ignore")

    schemaVersion: Literal[1] = 1
    generatedAt: str = Field(min_length=1)
    job: SelectedJob
    experience: list[SelectedExperience] = Field(default_factory=list)
    education: list[SelectedEducation] = Field(default_factory=list)
    projects: list[Any] = Field(default_factory=list)
