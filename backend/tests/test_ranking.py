from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from resume_orchestrator.sources.index_sources import index_sources
from resume_orchestrator.sources.select_sources import filter_candidates


@pytest_asyncio.fixture()
async def index(db_session: AsyncSession, user_uuid: uuid.UUID):
    return await index_sources(db_session, user_uuid)


class TestFilterCandidates:
    @pytest.mark.asyncio
    async def test_returns_experience_sources_when_filtered_by_kind(self, index) -> None:
        result = filter_candidates(index.docs, kinds=["experience"])
        assert len(result.docs) > 0
        for s in result.docs:
            assert s.kind == "experience"

    @pytest.mark.asyncio
    async def test_matches_by_tag(self, index) -> None:
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
