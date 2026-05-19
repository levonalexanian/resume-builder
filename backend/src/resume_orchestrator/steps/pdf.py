from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..pipeline.build_pdf import build_pdf
from ..util.fs_util import ensure_dir


@dataclass(slots=True)
class PdfStepResult:
    resume_pdf_path: Path
    build_log_path: Path


async def pdf_step(*, repo_root: str | Path, run_dir: str | Path) -> PdfStepResult:
    run_dir_p = Path(run_dir)
    ensure_dir(run_dir_p)
    tex_path = run_dir_p / "resume.tex"
    pdf_path = run_dir_p / "resume.pdf"
    log_path = run_dir_p / "build.log"
    await build_pdf(tex_path=tex_path, pdf_path=pdf_path, log_path=log_path, repo_root=repo_root)
    return PdfStepResult(resume_pdf_path=pdf_path, build_log_path=log_path)
