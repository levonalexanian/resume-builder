from __future__ import annotations

import json
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from jinja2 import Environment
from sqlalchemy.ext.asyncio import AsyncSession

from ..clients.llm_draft import (
    DraftProvider,
    DraftRequest,
    extract_latex_document,
    resolve_draft_provider,
)
from ..resume_config.load_resume_config import load_resume_config
from ..schemas.job_analysis import JobAnalysis
from ..schemas.ranked_sources import RankedSources
from ..sources.types import SelectedBullet, SelectedEducation, SelectedExperience, SelectedJob, SelectedSources
from ..tex.render import render_latex
from ..util.env import MissingApiKeyError, ResumeEnv, load_resume_env
from ..util.fs_util import ensure_dir
from ..util.time_util import now_iso


@dataclass(slots=True)
class DraftStepResult:
    resume_tex_path: Path
    via: Literal["deterministic", "llm"]
    provider: DraftProvider | None = None


def _ranked_to_selected(ranked: RankedSources, max_exp: int, max_bullets: int) -> SelectedSources:
    experience = [
        SelectedExperience(
            company=e.title,
            role=e.role,
            location=e.location,
            duration=e.duration,
            bullets=[
                SelectedBullet(text=b.text, evidence=b.evidence, score=b.score)
                for b in e.bullets[:max_bullets]
            ],
            evidence=e.evidence,
        )
        for e in ranked.experience[:max_exp]
    ]
    education = [
        SelectedEducation(
            school=e.title,
            diploma=e.diploma,
            location=e.location,
            duration=e.duration,
            gpa=e.gpa,
            bullets=[],
            evidence=e.evidence,
        )
        for e in ranked.education
    ]
    projects = [
        {
            "title": p.title,
            "duration": p.duration,
            "evidence": p.evidence,
            "bullets": [
                {"text": b.text, "evidence": b.evidence, "score": b.score} for b in p.bullets
            ],
        }
        for p in ranked.projects[:max_exp]
    ]
    return SelectedSources(
        schemaVersion=1,
        generatedAt=now_iso(),
        job=SelectedJob(
            path=ranked.job.path,
            company=ranked.job.company,
            focus=ranked.job.focus,
        ),
        experience=experience,
        education=education,
        projects=projects,
    )


def _render_prompt(template: str, **view: str) -> str:
    env = Environment(autoescape=False, keep_trailing_newline=True)
    return env.from_string(template).render(**view)


async def draft_step(
    *,
    repo_root: str | Path,
    run_dir: str | Path,
    job_path: str | Path,
    session: AsyncSession,
    user_id: uuid.UUID,
    template_path: str | Path,
    max_experiences: int = 2,
    max_bullets_per_experience: int = 4,
    env: ResumeEnv | None = None,
) -> DraftStepResult:
    repo_root_p = Path(repo_root)
    run_dir_p = Path(run_dir)
    job_path_p = Path(job_path)
    template_path_p = Path(template_path)

    ensure_dir(run_dir_p)
    inputs_dir = ensure_dir(run_dir_p / "inputs")
    env = env or load_resume_env(repo_root_p)

    ranked_path = inputs_dir / "ranked_sources.json"
    analysis_path = inputs_dir / "job_analysis.json"
    ranked = RankedSources.model_validate(json.loads(ranked_path.read_text(encoding="utf-8")))
    analysis = JobAnalysis.model_validate(json.loads(analysis_path.read_text(encoding="utf-8")))

    template_text = template_path_p.read_text(encoding="utf-8")
    resume_config = await load_resume_config(session, user_id)
    selection = _ranked_to_selected(ranked, max_experiences, max_bullets_per_experience)

    shutil.copyfile(template_path_p, inputs_dir / "template.tex")
    (inputs_dir / "resume.config.json").write_text(
        json.dumps(resume_config.model_dump(), indent=2) + "\n", encoding="utf-8"
    )
    shutil.copyfile(job_path_p, inputs_dir / job_path_p.name)

    resume_tex_path = run_dir_p / "resume.tex"

    if env.RESUME_USE_LLM_DRAFT:
        if not env.RESUME_DRAFT_PROVIDER and not (
            env.OPENAI_API_KEY or env.ANTHROPIC_API_KEY or env.GOOGLE_GENERATIVE_AI_API_KEY
        ):
            raise MissingApiKeyError(
                "RESUME_USE_LLM_DRAFT",
                "OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY",
            )
        resolved = resolve_draft_provider(env)
        prompt_template_path = repo_root_p / "templates" / "generate.prompt.md"
        prompt_template = prompt_template_path.read_text(encoding="utf-8")

        try:
            job_rel = job_path_p.relative_to(repo_root_p).as_posix()
        except ValueError:
            job_rel = job_path_p.as_posix()
        try:
            run_rel = run_dir_p.relative_to(repo_root_p).as_posix()
        except ValueError:
            run_rel = run_dir_p.as_posix()
        context_rel = run_rel + "/context/"

        source_list_lines: list[str] = []
        for e in [*ranked.experience, *ranked.education, *ranked.projects]:
            evidence = e.evidence[0] if e.evidence else e.id
            source_list_lines.append(f"- {evidence} — {e.title}")
        source_list = "\n".join(source_list_lines)

        user_prompt = "\n".join(
            [
                _render_prompt(
                    prompt_template,
                    JOB_PATH=job_rel,
                    CONTEXT_DIR=context_rel,
                    RUN_DIR=run_rel,
                    SOURCE_LIST=source_list,
                ),
                "",
                "## Inputs (verbatim JSON)",
                "",
                "### job_analysis.json",
                "```json",
                json.dumps(analysis.model_dump(), indent=2),
                "```",
                "",
                "### ranked_sources.json",
                "```json",
                json.dumps(ranked.model_dump(), indent=2),
                "```",
                "",
                "### template.tex (Mustache delimiters << >>)",
                "```latex",
                template_text,
                "```",
                "",
                "### resume.config.json",
                "```json",
                json.dumps(resume_config.model_dump(), indent=2),
                "```",
                "",
                "Output the COMPLETE resume.tex (no fences, no commentary).",
            ]
        )

        raw = await resolved.client(
            DraftRequest(
                system=(
                    "You are a careful resume engineer. Fill the LaTeX template using only "
                    "facts present in ranked_sources.json and the source files referenced by "
                    "evidence paths. Output the full .tex document."
                ),
                user=user_prompt,
            )
        )

        latex = extract_latex_document(raw)
        resume_tex_path.write_text(latex, encoding="utf-8")
        return DraftStepResult(
            resume_tex_path=resume_tex_path, via="llm", provider=resolved.provider
        )

    result = render_latex(
        template_text=template_text,
        resume_config=resume_config,
        selection=selection,
        repo_root=str(repo_root_p),
    )
    resume_tex_path.write_text(result.latex, encoding="utf-8")
    return DraftStepResult(resume_tex_path=resume_tex_path, via="deterministic")
