from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
from pathlib import Path

import pytest

from resume_orchestrator.schemas.job_analysis import JobAnalysis
from resume_orchestrator.steps.analyze import analyze_step
from resume_orchestrator.steps.draft import draft_step
from resume_orchestrator.steps.rank import rank_step
from resume_orchestrator.steps.retrieve import retrieve_step


@pytest.fixture()
def run_setup(repo_root: Path):
    tmp = Path(tempfile.mkdtemp(prefix="resume-run-"))
    job_path = tmp / "job.md"
    job_path.write_text(
        "\n".join(
            [
                "Company: Talk To Medi",
                "",
                "We are hiring a Full Stack Developer.",
                "Must be comfortable with TypeScript, React, GraphQL, and SQL.",
                "Bonus: Prisma, AWS, and embedded experience.",
            ]
        ),
        encoding="utf-8",
    )
    try:
        yield repo_root, tmp, job_path
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@pytest.mark.asyncio
async def test_deterministic_pipeline_writes_artifacts(run_setup) -> None:
    repo_root, run_dir, job_path = run_setup
    os.environ["RESUME_USE_PERPLEXITY_RESEARCH"] = "false"
    os.environ["RESUME_USE_LLM_DRAFT"] = "false"

    analyze = await analyze_step(repo_root=repo_root, job_path=job_path, run_dir=run_dir)
    assert analyze.via == "manual"

    stub = json.loads(analyze.job_analysis_path.read_text(encoding="utf-8"))
    filled = JobAnalysis.model_validate(
        {
            **stub,
            "tagsForGraphQL": {
                "company": "Talk To Medi",
                "roleFamily": "fullstack",
                "domains": ["health"],
                "stack": ["typescript", "react", "graphql", "sql"],
                "kinds": ["experience", "education", "project"],
                "groups": [],
            },
            "tagsForTokenization": ["typescript", "react", "graphql", "prisma", "aws"],
            "summaryForGeneration": "Fullstack developer role centered on TS/React/GraphQL.",
        }
    )
    analyze.job_analysis_path.write_text(
        json.dumps(filled.model_dump(), indent=2) + "\n", encoding="utf-8"
    )

    retrieve = await retrieve_step(repo_root=repo_root, run_dir=run_dir)
    assert retrieve.candidate_count > 0

    rank = await rank_step(repo_root=repo_root, run_dir=run_dir, job_path=job_path)
    ranked = json.loads(rank.ranked_sources_path.read_text(encoding="utf-8"))
    weight_sum = ranked["weights"]["relevancy"] + ranked["weights"]["freshness"]
    assert weight_sum == pytest.approx(1.0, abs=1e-6)
    assert isinstance(ranked["experience"], list)
    if ranked["experience"]:
        first = ranked["experience"][0]
        assert 0.0 <= first["relevancy"] <= 1.0
        assert 0.0 <= first["freshness"] <= 1.0
        assert first["score"] >= 0.0

    config_path = repo_root / "resume.config.json"
    if not config_path.exists():
        config_path = repo_root / "resume.config.json.example"
    draft = await draft_step(
        repo_root=repo_root,
        run_dir=run_dir,
        job_path=job_path,
        config_path=config_path,
        template_path=repo_root / "templates" / "resume_template.tex",
        max_experiences=2,
        max_bullets_per_experience=4,
    )
    assert draft.via == "deterministic"

    tex = draft.resume_tex_path.read_text(encoding="utf-8")
    assert re.search(r"\\documentclass", tex)
    assert re.search(r"\\section\{Experience\}", tex)
    assert re.search(r"\\section\{Education\}", tex)
