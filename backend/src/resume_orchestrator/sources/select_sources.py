from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from ..util.text_util import normalize_company_name, tokenize
from ..util.time_util import now_iso
from .types import (
    SelectedBullet,
    SelectedEducation,
    SelectedExperience,
    SelectedJob,
    SelectedSources,
    SourceDoc,
    SourcesIndex,
)

FilterKind = Literal["experience", "education", "project"]

_COMPANY_LINE_RE = re.compile(r"^\s*(company|employer)\s*:\s*(.+)\s*$", re.IGNORECASE | re.MULTILINE)
_JOB_DESCRIPTION_RE = re.compile(r"job description", re.IGNORECASE)
_OVERVIEW_RE = re.compile(r"/overview\.md$", re.IGNORECASE)
_KNOWN_COMPANIES = ["Talk To Medi", "Gastronomous", "University of Waterloo", "Waterloo Formula Electric"]


@dataclass(slots=True)
class SelectSourcesOpts:
    job_text: str
    job_path: str
    sources_index: SourcesIndex
    max_experiences: int
    max_bullets_per_experience: int
    company_override: str | None = None
    focus_override: str | None = None


@dataclass(slots=True)
class FilterResult:
    docs: list[SourceDoc]
    matched_by_id: dict[str, list[str]]


def _matches_filter(
    doc: SourceDoc,
    kinds: Iterable[FilterKind] | None,
    groups: Iterable[str] | None,
    tags: Iterable[str] | None,
) -> tuple[bool, list[str]]:
    matched: list[str] = []
    kinds_list = list(kinds) if kinds else []
    if kinds_list:
        if doc.kind == "other":
            return False, matched
        if doc.kind not in kinds_list:
            return False, matched
        matched.append(f"kind:{doc.kind}")
    elif doc.kind == "other":
        return False, matched

    groups_list = list(groups) if groups else []
    if groups_list:
        norm_groups = {g.lower() for g in groups_list}
        if doc.group.lower() not in norm_groups and doc.groupKey.lower() not in norm_groups:
            return False, matched
        matched.append(f"group:{doc.groupKey}")

    tags_list = list(tags) if tags else []
    if tags_list:
        wanted = {t.lower() for t in tags_list}
        have = {t.lower() for t in doc.tags}
        hits = sorted(wanted & have)
        if not hits:
            return False, matched
        for h in hits:
            matched.append(f"tag:{h}")

    return True, matched


def filter_candidates(
    docs: Iterable[SourceDoc],
    kinds: Iterable[FilterKind] | None = None,
    groups: Iterable[str] | None = None,
    tags: Iterable[str] | None = None,
) -> FilterResult:
    """Plain-Python replacement for the previous GraphQL retrieval query.

    Returns the matching docs and a per-doc list of `kind:`/`group:`/`tag:` tokens
    so the audit artifact can record which filters caught each candidate.
    """
    filtered: list[SourceDoc] = []
    matched_by_id: dict[str, list[str]] = {}
    for doc in docs:
        ok, matched = _matches_filter(doc, kinds, groups, tags)
        if not ok:
            continue
        filtered.append(doc)
        if matched:
            matched_by_id[doc.id] = matched
    return FilterResult(docs=filtered, matched_by_id=matched_by_id)


def infer_company(job_text: str) -> str | None:
    company_line = _COMPANY_LINE_RE.search(job_text)
    if company_line:
        return normalize_company_name(company_line.group(2))

    first_line: str | None = None
    for raw in job_text.splitlines():
        line = raw.strip()
        if line:
            first_line = line
            break
    if first_line and len(first_line) < 80 and not _JOB_DESCRIPTION_RE.search(first_line):
        head = re.split(r"[-—|]", first_line, maxsplit=1)[0].strip()
        if head and len(head) >= 2:
            return normalize_company_name(head)

    for known in _KNOWN_COMPANIES:
        pattern = re.compile(r"\b" + re.sub(r"\s+", r"\\s+", known) + r"\b", re.IGNORECASE)
        if pattern.search(job_text):
            return known

    return None


def infer_focus(job_text: str) -> str | None:
    t = job_text.lower()
    if re.search(r"full[-\s]?stack|frontend|backend|react|typescript|graphql", t):
        return "fullstack"
    if re.search(r"firmware|stm32|rtos|freertos|bare\s*metal", t):
        return "firmware"
    if re.search(r"embedded|can\s*bus|spi|i2c", t):
        return "embedded"
    if re.search(r"machine\s*learning|artificial\s+intelligence|computer\s*vision|nlp\b", t):
        return "ai"
    return None


def _score_text_against_job(job_tokens: set[str], text: str, tags: list[str]) -> int:
    score = 0
    for tok in tokenize(text):
        if tok in job_tokens:
            score += 1
    for tag in tags:
        if tag in job_tokens:
            score += 3
    return score


def select_sources(opts: SelectSourcesOpts) -> SelectedSources:
    company = opts.company_override or infer_company(opts.job_text)
    focus = opts.focus_override or infer_focus(opts.job_text)

    job_tokens = set(tokenize(opts.job_text))
    if focus:
        job_tokens.add(focus)

    exp_docs = [d for d in opts.sources_index.docs if d.kind == "experience"]
    edu_docs = [d for d in opts.sources_index.docs if d.kind == "education"]

    exp_by_group: dict[str, list[SourceDoc]] = {}
    for doc in exp_docs:
        exp_by_group.setdefault(doc.group, []).append(doc)

    ranked_groups: list[tuple[str, list[SourceDoc], int]] = []
    for group, docs in exp_by_group.items():
        best = max(
            _score_text_against_job(job_tokens, "\n".join([d.title, d.text, *d.bullets]), d.tags)
            for d in docs
        )
        ranked_groups.append((group, docs, best))
    ranked_groups.sort(key=lambda x: x[2], reverse=True)

    selected_experiences: list[SelectedExperience] = []
    for group, docs, _ in ranked_groups[: opts.max_experiences]:
        overview = next((d for d in docs if _OVERVIEW_RE.search(d.path)), None)
        company_name = overview.title if overview else group
        role = overview.meta.get("role") if overview else None
        location = overview.meta.get("location") if overview else None
        duration = overview.meta.get("duration") if overview else None

        candidates: list[tuple[str, str, int]] = []
        for doc in docs:
            for bullet in doc.bullets:
                score = _score_text_against_job(job_tokens, bullet, doc.tags)
                if score <= 0:
                    continue
                candidates.append((bullet, doc.path, score))

        candidates.sort(key=lambda c: c[2], reverse=True)
        bullets = [
            SelectedBullet(text=t, evidence=[ev], score=s)
            for t, ev, s in candidates[: opts.max_bullets_per_experience]
        ]
        evidence: list[str] = []
        seen: set[str] = set()
        for b in bullets:
            for e in b.evidence:
                if e in seen:
                    continue
                seen.add(e)
                evidence.append(e)

        selected_experiences.append(
            SelectedExperience(
                company=company_name,
                role=role,
                location=location,
                duration=duration,
                bullets=bullets,
                evidence=evidence,
            )
        )

    selected_education = [
        SelectedEducation(
            school=d.title,
            diploma=d.meta.get("diploma"),
            location=d.meta.get("location"),
            duration=d.meta.get("duration"),
            gpa=d.meta.get("gpa"),
            bullets=[],
            evidence=[d.path],
        )
        for d in edu_docs
        if _OVERVIEW_RE.search(d.path)
    ]

    return SelectedSources(
        schemaVersion=1,
        generatedAt=now_iso(),
        job=SelectedJob(path=opts.job_path, company=company, focus=focus),
        experience=selected_experiences,
        education=selected_education,
        projects=[],
    )
