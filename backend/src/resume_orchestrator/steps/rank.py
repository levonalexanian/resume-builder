from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from ..schemas.job_analysis import JobAnalysis
from ..schemas.ranked_sources import (
    RankedBullet,
    RankedEntry,
    RankedJob,
    RankedSources,
    RankedWeights,
)
from ..schemas.retrieval_candidates import RetrievalCandidates
from ..sources.index_sources import index_sources
from ..sources.types import SourceDoc, SourcesIndex
from ..util.date_util import freshness_score
from ..util.fs_util import ensure_dir
from ..util.text_util import tokenize
from ..util.time_util import now_iso

_DEFAULT_WEIGHTS = RankedWeights(relevancy=0.75, freshness=0.25)


@dataclass(slots=True)
class RankStepResult:
    ranked_sources_path: Path


def _score_text(job_tokens: set[str], text: str, tags: list[str]) -> int:
    score = 0
    for tok in tokenize(text):
        if tok in job_tokens:
            score += 1
    for tag in tags:
        if tag in job_tokens:
            score += 3
    return score


def _normalize(values: list[float]) -> list[float]:
    if not values:
        return []
    top = max(values)
    if top <= 0:
        return [0.0 for _ in values]
    return [v / top for v in values]


def _is_overview(path: str) -> bool:
    return path.lower().endswith("/overview.md")


def _rank_experience(
    index: SourcesIndex,
    candidate_ids: set[str],
    job_tokens: set[str],
    weights: RankedWeights,
    now: datetime,
) -> list[RankedEntry]:
    exp_docs = [d for d in index.docs if d.kind == "experience" and d.id in candidate_ids]
    by_key: dict[str, list[SourceDoc]] = {}
    for d in exp_docs:
        by_key.setdefault(d.groupKey, []).append(d)

    @dataclass(slots=True)
    class GroupAcc:
        overview: SourceDoc | None
        docs: list[SourceDoc]
        raw_relevancy: int
        raw_freshness: float
        bullets_raw: list[tuple[str, list[str], int, float]]

    groups: list[GroupAcc] = []
    for docs in by_key.values():
        overview = next((d for d in docs if _is_overview(d.path)), None)
        raw_relevancy = max(
            _score_text(job_tokens, "\n".join([d.title, d.text, *d.bullets]), d.tags)
            for d in docs
        )
        raw_freshness = freshness_score(
            overview.meta.get("duration") if overview else None, now
        )
        bullets_raw: list[tuple[str, list[str], int, float]] = []
        for d in docs:
            duration = d.meta.get("duration") or (overview.meta.get("duration") if overview else None)
            doc_freshness = freshness_score(duration, now)
            for bullet in d.bullets:
                rel = _score_text(job_tokens, bullet, d.tags)
                if rel <= 0:
                    continue
                bullets_raw.append((bullet, [d.path], rel, doc_freshness))
        groups.append(GroupAcc(overview, docs, raw_relevancy, raw_freshness, bullets_raw))

    norm_rel = _normalize([float(g.raw_relevancy) for g in groups])

    entries: list[RankedEntry] = []
    for g, rel in zip(groups, norm_rel, strict=True):
        bullet_rel_norm = _normalize([float(b[2]) for b in g.bullets_raw])
        bullets = [
            RankedBullet(
                text=b[0],
                evidence=b[1],
                relevancy=br,
                freshness=b[3],
                score=weights.relevancy * br + weights.freshness * b[3],
            )
            for b, br in zip(g.bullets_raw, bullet_rel_norm, strict=True)
        ]
        bullets.sort(key=lambda x: x.score, reverse=True)

        rep_doc = g.overview or g.docs[0]
        score = weights.relevancy * rel + weights.freshness * g.raw_freshness
        seen: set[str] = set()
        evidence: list[str] = []
        for d in g.docs:
            if d.path in seen:
                continue
            seen.add(d.path)
            evidence.append(d.path)

        entries.append(
            RankedEntry(
                id=rep_doc.id,
                kind="experience",
                group=rep_doc.group,
                title=(g.overview.title if g.overview else rep_doc.title),
                role=g.overview.meta.get("role") if g.overview else None,
                location=g.overview.meta.get("location") if g.overview else None,
                duration=g.overview.meta.get("duration") if g.overview else None,
                relevancy=rel,
                freshness=g.raw_freshness,
                score=score,
                evidence=evidence,
                bullets=bullets,
            )
        )

    entries.sort(key=lambda x: x.score, reverse=True)
    return entries


def _rank_education(
    index: SourcesIndex,
    candidate_ids: set[str],
    job_tokens: set[str],
    weights: RankedWeights,
    now: datetime,
) -> list[RankedEntry]:
    docs = [
        d
        for d in index.docs
        if d.kind == "education" and d.id in candidate_ids and _is_overview(d.path)
    ]
    raw = [
        (
            d,
            _score_text(job_tokens, "\n".join([d.title, d.text]), d.tags),
            freshness_score(d.meta.get("duration"), now),
        )
        for d in docs
    ]
    norm_r = _normalize([float(r) for _, r, _ in raw])
    entries = [
        RankedEntry(
            id=d.id,
            kind="education",
            group=d.group,
            title=d.title,
            location=d.meta.get("location"),
            duration=d.meta.get("duration"),
            diploma=d.meta.get("diploma"),
            gpa=d.meta.get("gpa"),
            relevancy=r,
            freshness=f,
            score=weights.relevancy * r + weights.freshness * f,
            evidence=[d.path],
            bullets=[],
        )
        for (d, _, f), r in zip(raw, norm_r, strict=True)
    ]
    entries.sort(key=lambda x: x.score, reverse=True)
    return entries


def _rank_projects(
    index: SourcesIndex,
    candidate_ids: set[str],
    job_tokens: set[str],
    weights: RankedWeights,
    now: datetime,
) -> list[RankedEntry]:
    docs = [d for d in index.docs if d.kind == "project" and d.id in candidate_ids]
    raw = [
        (
            d,
            _score_text(job_tokens, "\n".join([d.title, d.text, *d.bullets]), d.tags),
            freshness_score(d.meta.get("duration"), now),
        )
        for d in docs
    ]
    norm_r = _normalize([float(r) for _, r, _ in raw])
    entries = [
        RankedEntry(
            id=d.id,
            kind="project",
            group=d.group,
            title=d.title,
            location=d.meta.get("location"),
            duration=d.meta.get("duration"),
            relevancy=r,
            freshness=f,
            score=weights.relevancy * r + weights.freshness * f,
            evidence=[d.path],
            bullets=[
                RankedBullet(
                    text=b,
                    evidence=[d.path],
                    relevancy=1.0,
                    freshness=f,
                    score=1.0,
                )
                for b in d.bullets
            ],
        )
        for (d, _, f), r in zip(raw, norm_r, strict=True)
    ]
    entries.sort(key=lambda x: x.score, reverse=True)
    return entries


async def rank_step(
    *,
    repo_root: str | Path,
    run_dir: str | Path,
    job_path: str | Path,
    weights: RankedWeights | None = None,
    now: datetime | None = None,
) -> RankStepResult:
    repo_root_p = Path(repo_root)
    run_dir_p = Path(run_dir)
    job_path_p = Path(job_path)

    inputs_dir = ensure_dir(run_dir_p / "inputs")
    analysis_path = inputs_dir / "job_analysis.json"
    candidates_path = inputs_dir / "retrieval_candidates.json"

    analysis = JobAnalysis.model_validate(
        json.loads(analysis_path.read_text(encoding="utf-8"))
    )
    candidates = RetrievalCandidates.model_validate(
        json.loads(candidates_path.read_text(encoding="utf-8"))
    )

    index = index_sources(repo_root_p)
    candidate_ids = {c.id for c in candidates.candidates}

    job_text = job_path_p.read_text(encoding="utf-8")
    job_tokens: set[str] = set(tokenize(job_text))
    for t in analysis.tagsForTokenization:
        job_tokens.update(tokenize(t))
        job_tokens.add(t.lower())

    w = weights or _DEFAULT_WEIGHTS
    ref_now = now or datetime.now()

    experience = _rank_experience(index, candidate_ids, job_tokens, w, ref_now)
    education = _rank_education(index, candidate_ids, job_tokens, w, ref_now)
    projects = _rank_projects(index, candidate_ids, job_tokens, w, ref_now)

    try:
        job_rel = job_path_p.relative_to(repo_root_p).as_posix()
    except ValueError:
        job_rel = job_path_p.as_posix()

    ranked = RankedSources(
        schemaVersion=1,
        generatedAt=now_iso(),
        job=RankedJob(
            path=job_rel,
            company=analysis.tagsForGraphQL.company,
            focus=analysis.tagsForGraphQL.roleFamily,
        ),
        weights=w,
        experience=experience,
        education=education,
        projects=projects,
    )

    ranked_sources_path = inputs_dir / "ranked_sources.json"
    ranked_sources_path.write_text(
        json.dumps(ranked.model_dump(), indent=2) + "\n", encoding="utf-8"
    )

    return RankStepResult(ranked_sources_path=ranked_sources_path)
