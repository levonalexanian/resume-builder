from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from jinja2 import Environment

from ..clients.perplexity import PerplexityChatOpts, extract_json_object, perplexity_chat
from ..schemas.job_analysis import JobAnalysis, TagsForGraphQL
from ..util.env import MissingApiKeyError, ResumeEnv, load_resume_env
from ..util.fs_util import ensure_dir
from ..util.time_util import now_iso

SYSTEM_PROMPT = (
    "You are a job-description analyst. You MUST output a single JSON object matching "
    "the schema described in the user prompt and nothing else. No prose, no markdown fences."
)


@dataclass(slots=True)
class AnalyzeStepResult:
    job_analysis_path: Path
    via: Literal["perplexity", "manual"]
    manual_prompt_path: Path | None = None


def _render_search_prompt(template: str, job_text: str, job_path: str) -> str:
    env = Environment(autoescape=False, keep_trailing_newline=True)
    return env.from_string(template).render(JOB_PATH=job_path, JOB_TEXT=job_text)


async def analyze_step(
    *,
    repo_root: str | Path,
    job_path: str | Path,
    run_dir: str | Path,
    env: ResumeEnv | None = None,
) -> AnalyzeStepResult:
    repo_root_p = Path(repo_root)
    job_path_p = Path(job_path)
    run_dir_p = Path(run_dir)
    env = env or load_resume_env(repo_root_p)

    inputs_dir = ensure_dir(run_dir_p / "inputs")

    job_text = job_path_p.read_text(encoding="utf-8")
    try:
        job_rel_path = job_path_p.relative_to(repo_root_p).as_posix()
    except ValueError:
        job_rel_path = job_path_p.as_posix()

    template_path = repo_root_p / "templates" / "search.prompt.md"
    template = template_path.read_text(encoding="utf-8")
    user_prompt = _render_search_prompt(template, job_text, job_rel_path)

    job_analysis_path = inputs_dir / "job_analysis.json"

    if env.RESUME_USE_PERPLEXITY_RESEARCH:
        if not env.PERPLEXITY_API_KEY:
            raise MissingApiKeyError("RESUME_USE_PERPLEXITY_RESEARCH", "PERPLEXITY_API_KEY")
        raw = await perplexity_chat(
            PerplexityChatOpts(
                api_key=env.PERPLEXITY_API_KEY,
                system=SYSTEM_PROMPT,
                user=user_prompt,
                response_format="json_object",
            )
        )
        json_text = extract_json_object(raw)
        parsed = json.loads(json_text)
        merged = JobAnalysis.model_validate(
            {
                "schemaVersion": 1,
                "generatedAt": now_iso(),
                "jobSource": parsed.get("jobSource") or job_rel_path,
                "tagsForGraphQL": parsed.get("tagsForGraphQL")
                or {
                    "domains": [],
                    "stack": [],
                    "kinds": ["experience", "education", "project"],
                    "groups": [],
                },
                "tagsForTokenization": parsed.get("tagsForTokenization") or [],
                "summaryForGeneration": parsed.get("summaryForGeneration") or "",
                "rawProviderResponse": raw,
            }
        )
        job_analysis_path.write_text(
            json.dumps(merged.model_dump(), indent=2) + "\n", encoding="utf-8"
        )
        return AnalyzeStepResult(job_analysis_path=job_analysis_path, via="perplexity")

    manual_prompt_path = inputs_dir / "job_analysis.MANUAL.md"
    manual_prompt = (
        "<!--\n"
        "Manual Step 1: paste this prompt into Perplexity (or any chat UI),\n"
        "then save the JSON response to inputs/job_analysis.json next to this file.\n"
        "The CLI's `retrieve` and `rank` subcommands will pick it up automatically.\n"
        "-->\n\n"
    ) + user_prompt
    manual_prompt_path.write_text(manual_prompt, encoding="utf-8")

    if not job_analysis_path.exists():
        stub = JobAnalysis(
            schemaVersion=1,
            generatedAt=now_iso(),
            jobSource=job_rel_path,
            tagsForGraphQL=TagsForGraphQL(
                domains=[],
                stack=[],
                kinds=["experience", "education", "project"],
                groups=[],
            ),
            tagsForTokenization=[],
            summaryForGeneration="TODO: fill summaryForGeneration via the manual prompt.",
        )
        job_analysis_path.write_text(
            json.dumps(stub.model_dump(), indent=2) + "\n", encoding="utf-8"
        )

    return AnalyzeStepResult(
        job_analysis_path=job_analysis_path,
        via="manual",
        manual_prompt_path=manual_prompt_path,
    )
