from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Kind = Literal["experience", "education", "project"]


class TagsForGraphQL(BaseModel):
    model_config = ConfigDict(extra="ignore")

    company: str | None = None
    roleFamily: str | None = None
    seniority: str | None = None
    domains: list[str] = Field(default_factory=list)
    stack: list[str] = Field(default_factory=list)
    kinds: list[Kind] = Field(
        default_factory=lambda: ["experience", "education", "project"]
    )
    groups: list[str] = Field(default_factory=list)


class JobAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")

    schemaVersion: Literal[1] = 1
    generatedAt: str = Field(min_length=1)
    jobSource: str = Field(min_length=1)
    tagsForGraphQL: TagsForGraphQL
    tagsForTokenization: list[str] = Field(default_factory=list)
    summaryForGeneration: str = Field(min_length=1)
    rawProviderResponse: str | None = None
