from __future__ import annotations

import asyncio
import json
from pathlib import Path


async def _run_command(command: str, args: list[str], cwd: Path) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        command,
        *args,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_b, stderr_b = await proc.communicate()
    return proc.returncode or 0, stdout_b.decode("utf-8", errors="replace"), stderr_b.decode("utf-8", errors="replace")


def _find_repo_root(start_dir: Path) -> Path:
    current = start_dir.resolve()
    for _ in range(10):
        candidate = current / "scripts" / "latex_to_pdf"
        if candidate.exists():
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent
    return start_dir.resolve()


async def build_pdf(
    *,
    tex_path: str | Path,
    pdf_path: str | Path | None = None,
    log_path: str | Path | None = None,
    repo_root: str | Path | None = None,
) -> None:
    tex_abs = Path(tex_path).resolve()
    pdf_abs = (
        Path(pdf_path).resolve()
        if pdf_path
        else tex_abs.with_suffix(".pdf")
    )
    log_abs = Path(log_path).resolve() if log_path else None
    root = Path(repo_root).resolve() if repo_root else _find_repo_root(Path.cwd())
    script_path = root / "scripts" / "latex_to_pdf"

    args = [str(script_path), str(tex_abs), str(pdf_abs)]
    code, stdout, stderr = await _run_command("bash", args, root)

    cmd_repr = "bash " + " ".join(json.dumps(a) for a in args)
    log = "\n".join(
        [
            f"command: {cmd_repr}",
            f"exit_code: {code}",
            "--- stdout ---",
            stdout.rstrip(),
            "--- stderr ---",
            stderr.rstrip(),
            "",
        ]
    )

    if log_abs is not None:
        log_abs.write_text(log, encoding="utf-8")

    if code != 0:
        location = str(log_abs) if log_abs else "stderr"
        raise RuntimeError(f"latex build failed (exit {code}). See {location}.")
