from __future__ import annotations

from pathlib import Path

import pytest

from resume_orchestrator.sources.index_sources import index_sources
from resume_orchestrator.sources.select_sources import filter_candidates


@pytest.fixture(scope="module")
def index(repo_root: Path):
    return index_sources(repo_root)


class TestFilterCandidates:
    def test_returns_experience_sources_when_filtered_by_kind(self, index) -> None:
        result = filter_candidates(index.docs, kinds=["experience"])
        assert len(result.docs) > 0
        for s in result.docs:
            assert s.kind == "experience"

    def test_matches_by_tag(self, index) -> None:
        # Find a (kind, tag) that exists in the indexed corpus so the assertion
        # holds regardless of whether tests run against the example markdown or
        # the developer's real source files.
        target_kind: str | None = None
        target_tag: str | None = None
        for d in index.docs:
            if d.kind in ("experience", "education", "project") and d.tags:
                target_kind = d.kind
                target_tag = d.tags[0]
                break
        assert target_kind is not None and target_tag is not None, "no tagged docs to test against"

        result = filter_candidates(index.docs, kinds=[target_kind], tags=[target_tag])  # type: ignore[arg-type]
        assert len(result.docs) > 0
        for s in result.docs:
            matched = result.matched_by_id.get(s.id, [])
            assert any(token.startswith("tag:") for token in matched)
