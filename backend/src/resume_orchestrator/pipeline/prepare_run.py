from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from ..util.fs_util import ensure_dir
from ..util.text_util import safe_basename
from ..util.time_util import now_run_id


def derive_run_slug(company: str | None, focus: str | None) -> str:
    base = safe_basename(company or "run")
    tail = f"_{safe_basename(focus)}" if focus else ""
    return f"{now_run_id()}_{base}{tail}"


@dataclass(slots=True)
class PreparedRun:
    run_dir: Path
    inputs_dir: Path
    context_dir: Path
    job_copy_path: Path


def prepare_run(
    *,
    out_dir: str | Path,
    job_path: str | Path,
    company: str | None,
    focus: str | None,
) -> PreparedRun:
    out_dir_p = Path(out_dir)
    job_path_p = Path(job_path)

    slug = derive_run_slug(company, focus)
    run_dir = out_dir_p / slug
    inputs_dir = ensure_dir(run_dir / "inputs")
    context_dir = ensure_dir(run_dir / "context")

    job_copy_path = inputs_dir / job_path_p.name
    shutil.copyfile(job_path_p, job_copy_path)

    return PreparedRun(
        run_dir=run_dir,
        inputs_dir=inputs_dir,
        context_dir=context_dir,
        job_copy_path=job_copy_path,
    )


def rename_run_dir(current_dir: Path, out_dir: Path, new_slug: str) -> Path:
    new_dir = out_dir / new_slug
    if new_dir == current_dir:
        return current_dir
    ensure_dir(new_dir.parent)
    current_dir.rename(new_dir)
    return new_dir
