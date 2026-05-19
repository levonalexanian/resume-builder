from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from ..schemas.job_analysis import JobAnalysis
from ..sources.index_sources import get_body_md_by_path
from ..sources.select_sources import infer_company, infer_focus
from ..steps.analyze import analyze_step
from ..steps.draft import draft_step
from ..steps.pdf import pdf_step
from ..steps.rank import rank_step
from ..steps.retrieve import retrieve_step
from ..util.env import load_resume_env
from ..util.fs_util import ensure_dir
from .prepare_run import derive_run_slug, prepare_run, rename_run_dir


@dataclass(slots=True)
class RunPipelineResult:
    run_dir: Path
    job_analysis_path: Path
    retrieval_candidates_path: Path
    ranked_sources_path: Path
    resume_tex_path: Path
    draft_via: Literal["deterministic", "llm"]
    resume_pdf_path: Path | None = None
    build_log_path: Path | None = None


async def _mirror_context(
    session: AsyncSession,
    user_id: uuid.UUID,
    ranked_sources_path: Path,
    context_dir: Path,
) -> None:
    raw = ranked_sources_path.read_text(encoding="utf-8")
    ranked = json.loads(raw)
    paths: set[str] = set()
    for key in ("experience", "education", "projects"):
        for entry in ranked.get(key) or []:
            for p in entry.get("evidence") or []:
                paths.add(p)
    ensure_dir(context_dir)
    for rel in paths:
        body = await get_body_md_by_path(session, user_id, rel)
        if body is None:
            continue
        dest = context_dir / rel
        try:
            ensure_dir(dest.parent)
            dest.write_text(body, encoding="utf-8")
        except OSError:
            continue


async def run_pipeline(
    *,
    repo_root: str | Path,
    session: AsyncSession,
    user_id: uuid.UUID,
    job_path: str | Path,
    out_dir: str | Path,
    template_path: str | Path,
    build_pdf: bool,
    max_experiences: int,
    max_bullets_per_experience: int,
    company: str | None = None,
    focus: str | None = None,
) -> RunPipelineResult:
    repo_root_p = Path(repo_root)
    job_path_p = Path(job_path)
    out_dir_p = Path(out_dir)

    env = load_resume_env(repo_root_p)
    job_text = job_path_p.read_text(encoding="utf-8")
    fallback_company = company or infer_company(job_text)
    fallback_focus = focus or infer_focus(job_text)

    prepared = prepare_run(
        out_dir=out_dir_p,
        job_path=job_path_p,
        company=fallback_company,
        focus=fallback_focus,
    )
    run_dir = prepared.run_dir

    analyze = await analyze_step(
        repo_root=repo_root_p, job_path=job_path_p, run_dir=run_dir, env=env
    )

    if not company or not focus:
        try:
            analysis = JobAnalysis.model_validate(
                json.loads(analyze.job_analysis_path.read_text(encoding="utf-8"))
            )
            inferred_company = company or analysis.tagsForGraphQL.company or fallback_company
            inferred_focus = focus or analysis.tagsForGraphQL.roleFamily or fallback_focus
            new_slug = derive_run_slug(inferred_company, inferred_focus)
            current_slug = run_dir.name
            if new_slug != current_slug:
                run_dir = rename_run_dir(run_dir, out_dir_p, new_slug)
        except (OSError, ValueError):
            pass

    await retrieve_step(session=session, user_id=user_id, run_dir=run_dir)
    rank = await rank_step(
        session=session, user_id=user_id, run_dir=run_dir, job_path=job_path_p
    )
    await _mirror_context(session, user_id, rank.ranked_sources_path, run_dir / "context")

    draft = await draft_step(
        repo_root=repo_root_p,
        run_dir=run_dir,
        job_path=job_path_p,
        session=session,
        user_id=user_id,
        template_path=template_path,
        max_experiences=max_experiences,
        max_bullets_per_experience=max_bullets_per_experience,
        env=env,
    )

    resume_pdf_path: Path | None = None
    build_log_path: Path | None = None
    if build_pdf:
        pdf = await pdf_step(repo_root=repo_root_p, run_dir=run_dir)
        resume_pdf_path = pdf.resume_pdf_path
        build_log_path = pdf.build_log_path

    return RunPipelineResult(
        run_dir=run_dir,
        job_analysis_path=run_dir / "inputs" / "job_analysis.json",
        retrieval_candidates_path=run_dir / "inputs" / "retrieval_candidates.json",
        ranked_sources_path=run_dir / "inputs" / "ranked_sources.json",
        resume_tex_path=run_dir / "resume.tex",
        draft_via=draft.via,
        resume_pdf_path=resume_pdf_path,
        build_log_path=build_log_path,
    )
