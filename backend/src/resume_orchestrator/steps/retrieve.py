from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from ..schemas.job_analysis import JobAnalysis
from ..schemas.retrieval_candidates import (
    RetrievalCandidate,
    RetrievalCandidates,
    RetrievalQuery,
)
from ..sources.index_sources import index_sources
from ..sources.select_sources import filter_candidates
from ..util.fs_util import ensure_dir
from ..util.time_util import now_iso


@dataclass(slots=True)
class RetrieveStepResult:
    retrieval_candidates_path: Path
    candidate_count: int


async def retrieve_step(*, repo_root: str | Path, run_dir: str | Path) -> RetrieveStepResult:
    repo_root_p = Path(repo_root)
    run_dir_p = Path(run_dir)
    inputs_dir = ensure_dir(run_dir_p / "inputs")

    job_analysis_path = inputs_dir / "job_analysis.json"
    analysis = JobAnalysis.model_validate(
        json.loads(job_analysis_path.read_text(encoding="utf-8"))
    )

    sources_index = index_sources(repo_root_p)

    groups = analysis.tagsForGraphQL.groups if analysis.tagsForGraphQL.groups else None
    tags = analysis.tagsForGraphQL.stack if analysis.tagsForGraphQL.stack else None

    primary = filter_candidates(
        sources_index.docs,
        kinds=analysis.tagsForGraphQL.kinds,
        groups=groups,
        tags=tags,
    )

    filtered_docs = primary.docs
    matched_by_id = primary.matched_by_id
    fallback = False
    if not filtered_docs:
        secondary = filter_candidates(sources_index.docs, kinds=analysis.tagsForGraphQL.kinds)
        filtered_docs = secondary.docs
        matched_by_id = secondary.matched_by_id
        fallback = True

    candidates = RetrievalCandidates(
        schemaVersion=1,
        generatedAt=now_iso(),
        query=RetrievalQuery(
            operation="Retrieve",
            variables={
                "filter": {
                    "kinds": list(analysis.tagsForGraphQL.kinds),
                    "groups": list(groups) if groups else None,
                    "tags": list(tags) if tags else None,
                }
            },
        ),
        candidates=[
            RetrievalCandidate(
                id=doc.id,
                path=doc.path,
                kind=doc.kind,  # type: ignore[arg-type]
                group=doc.group,
                title=doc.title,
                tags=doc.tags,
                matchedFilters=["fallback:kind-only"]
                if fallback
                else matched_by_id.get(doc.id, []),
            )
            for doc in filtered_docs
        ],
    )

    retrieval_candidates_path = inputs_dir / "retrieval_candidates.json"
    retrieval_candidates_path.write_text(
        json.dumps(candidates.model_dump(), indent=2) + "\n", encoding="utf-8"
    )

    return RetrieveStepResult(
        retrieval_candidates_path=retrieval_candidates_path,
        candidate_count=len(candidates.candidates),
    )
