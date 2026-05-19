from __future__ import annotations

import pytest
from pydantic import ValidationError

from resume_orchestrator.schemas.job_analysis import JobAnalysis
from resume_orchestrator.schemas.ranked_sources import RankedSources
from resume_orchestrator.schemas.retrieval_candidates import RetrievalCandidates


class TestJobAnalysisSchema:
    def test_accepts_minimal_valid_payload(self) -> None:
        parsed = JobAnalysis.model_validate(
            {
                "schemaVersion": 1,
                "generatedAt": "2026-01-01T00:00:00.000Z",
                "jobSource": "job.md",
                "tagsForGraphQL": {
                    "domains": ["robotics"],
                    "stack": ["typescript"],
                    "kinds": ["experience"],
                    "groups": [],
                },
                "tagsForTokenization": ["typescript", "robotics"],
                "summaryForGeneration": "Robotics-focused full-stack role.",
            }
        )
        assert len(parsed.summaryForGeneration) > 0

    def test_rejects_bad_schema_version(self) -> None:
        with pytest.raises(ValidationError):
            JobAnalysis.model_validate(
                {
                    "schemaVersion": 2,
                    "generatedAt": "x",
                    "jobSource": "j",
                    "tagsForGraphQL": {"domains": [], "stack": [], "kinds": [], "groups": []},
                    "tagsForTokenization": [],
                    "summaryForGeneration": "x",
                }
            )


class TestRetrievalCandidatesSchema:
    def test_accepts_empty_candidate_set(self) -> None:
        parsed = RetrievalCandidates.model_validate(
            {
                "schemaVersion": 1,
                "generatedAt": "2026-01-01T00:00:00.000Z",
                "query": {"operation": "Retrieve", "variables": {}},
                "candidates": [],
            }
        )
        assert parsed.candidates == []


class TestRankedSourcesSchema:
    def test_weights_and_entries(self) -> None:
        parsed = RankedSources.model_validate(
            {
                "schemaVersion": 1,
                "generatedAt": "2026-01-01T00:00:00.000Z",
                "job": {"path": "job.md"},
                "weights": {"relevancy": 0.75, "freshness": 0.25},
                "experience": [],
                "education": [],
                "projects": [],
            }
        )
        assert parsed.weights.relevancy == 0.75
