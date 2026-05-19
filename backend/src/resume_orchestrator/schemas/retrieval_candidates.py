from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Kind = Literal["experience", "education", "project"]


class RetrievalCandidate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    path: str = Field(min_length=1)
    kind: Kind
    group: str = Field(min_length=1)
    title: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)
    matchedFilters: list[str] = Field(default_factory=list)


class RetrievalQuery(BaseModel):
    model_config = ConfigDict(extra="ignore")

    operation: str = Field(min_length=1)
    variables: dict[str, Any] = Field(default_factory=dict)


class RetrievalCandidates(BaseModel):
    model_config = ConfigDict(extra="ignore")

    schemaVersion: Literal[1] = 1
    generatedAt: str = Field(min_length=1)
    query: RetrievalQuery
    candidates: list[RetrievalCandidate] = Field(default_factory=list)
