from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .db.engine import create_engine_from_env
from .db.models import User
from .db.session import async_session_factory, get_session
from .schemas.job_analysis import JobAnalysis
from .sources.index_sources import get_body_md_by_path, index_sources
from .sources.select_sources import infer_company, infer_focus
from .steps.analyze import analyze_step
from .steps.draft import draft_step
from .steps.pdf import pdf_step
from .steps.rank import rank_step
from .steps.retrieve import retrieve_step
from .util.env import load_resume_env
from .util.fs_util import ensure_dir
from .util.text_util import safe_basename
from .util.time_util import now_run_id

StepName = Literal["analyze", "retrieve", "rank", "draft", "pdf"]
StepStatus = Literal["pending", "running", "completed", "error"]

_RUN_ID_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})")


def _resolve_repo_root() -> Path:
    env_root = os.environ.get("RESUME_REPO_ROOT")
    return Path(env_root).resolve() if env_root else Path.cwd().resolve()


def _resolve_user_root(repo_root: Path, user_id: str) -> Path:
    return repo_root / "users" / user_id


def _frontend_dist_dir(repo_root: Path) -> Path:
    return repo_root / "frontend" / "dist"


def _parse_run_id_to_iso(run_id: str) -> str | None:
    m = _RUN_ID_RE.match(run_id)
    if not m:
        return None
    y, mo, d, h, mi = m.groups()
    return f"{y}-{mo}-{d}T{h}:{mi}:00Z"


def _run_label(run_id: str) -> str:
    parts = run_id.split("_")
    if len(parts) <= 1:
        return run_id
    return " · ".join(parts[1:])


def _read_optional_json(path: Path) -> Any | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _read_optional_text(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


async def _mirror_context(
    session: AsyncSession,
    user_id: uuid.UUID,
    ranked_sources_path: Path,
    context_dir: Path,
) -> None:
    try:
        ranked = json.loads(ranked_sources_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
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


def _sse(event: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(event)}\n\n".encode("utf-8")


async def _streaming_pipeline(
    *,
    repo_root: Path,
    user_root: Path,
    session_factory: Any,
    user_id_uuid: uuid.UUID,
    job_text: str,
    company_hint: str | None,
    focus_hint: str | None,
) -> AsyncIterator[bytes]:
    env = load_resume_env(repo_root)
    out_dir = user_root / "resumes"
    template_path = repo_root / "templates" / "resume_template.tex"

    fd, tmp_str = tempfile.mkstemp(prefix="resume-job-", suffix=".md", dir="/tmp")
    os.close(fd)
    tmp_job_path = Path(tmp_str)
    tmp_job_path.write_text(job_text, encoding="utf-8")

    try:
        fallback_company = company_hint or infer_company(job_text)
        fallback_focus = focus_hint or infer_focus(job_text)
        slug_base = safe_basename(fallback_company or "run")
        slug_tail = f"_{safe_basename(fallback_focus)}" if fallback_focus else ""
        provisional_slug = f"{now_run_id()}_{slug_base}{slug_tail}"
        run_dir = out_dir / provisional_slug
        ensure_dir(run_dir / "inputs")
        ensure_dir(run_dir / "context")
        shutil.copyfile(tmp_job_path, run_dir / "inputs" / tmp_job_path.name)

        yield _sse({"type": "step", "step": "analyze", "status": "running"})
        async with session_factory() as session:
            analyze = await analyze_step(
                repo_root=repo_root, job_path=tmp_job_path, run_dir=run_dir, env=env
            )

            if not company_hint or not focus_hint:
                try:
                    analysis = JobAnalysis.model_validate(
                        json.loads(analyze.job_analysis_path.read_text(encoding="utf-8"))
                    )
                    inferred_company = (
                        company_hint or analysis.tagsForGraphQL.company or fallback_company
                    )
                    inferred_focus = (
                        focus_hint or analysis.tagsForGraphQL.roleFamily or fallback_focus
                    )
                    new_base = safe_basename(inferred_company or "run")
                    new_tail = f"_{safe_basename(inferred_focus)}" if inferred_focus else ""
                    new_slug = f"{now_run_id()}_{new_base}{new_tail}"
                    if new_slug != provisional_slug:
                        new_dir = out_dir / new_slug
                        ensure_dir(new_dir.parent)
                        run_dir.rename(new_dir)
                        run_dir = new_dir
                except (OSError, ValueError):
                    pass
            yield _sse({"type": "step", "step": "analyze", "status": "completed"})

            yield _sse({"type": "step", "step": "retrieve", "status": "running"})
            await retrieve_step(session=session, user_id=user_id_uuid, run_dir=run_dir)
            yield _sse({"type": "step", "step": "retrieve", "status": "completed"})

            yield _sse({"type": "step", "step": "rank", "status": "running"})
            rank = await rank_step(
                session=session,
                user_id=user_id_uuid,
                run_dir=run_dir,
                job_path=tmp_job_path,
            )
            await _mirror_context(
                session, user_id_uuid, rank.ranked_sources_path, run_dir / "context"
            )
            yield _sse({"type": "step", "step": "rank", "status": "completed"})

            yield _sse({"type": "step", "step": "draft", "status": "running"})
            await draft_step(
                repo_root=repo_root,
                run_dir=run_dir,
                job_path=tmp_job_path,
                session=session,
                user_id=user_id_uuid,
                template_path=template_path,
                env=env,
            )
            yield _sse({"type": "step", "step": "draft", "status": "completed"})

            yield _sse({"type": "step", "step": "pdf", "status": "running"})
            await pdf_step(repo_root=repo_root, run_dir=run_dir)
            yield _sse({"type": "step", "step": "pdf", "status": "completed"})

        yield _sse({"type": "done", "runId": run_dir.name})
    except Exception as err:  # surface to client and end stream
        yield _sse({"type": "error", "message": str(err)})
    finally:
        try:
            tmp_job_path.unlink()
        except OSError:
            pass


def create_app(repo_root: Path | None = None) -> FastAPI:
    root = (repo_root or _resolve_repo_root()).resolve()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.repo_root = root
        engine = create_engine_from_env()
        app.state.engine = engine
        app.state.session_factory = async_session_factory(engine)
        try:
            yield
        finally:
            await engine.dispose()

    app = FastAPI(lifespan=lifespan)

    @app.get("/api/healthz")
    async def healthz(session: AsyncSession = Depends(get_session)) -> JSONResponse:
        result = await session.execute(text("SELECT 1"))
        value = result.scalar_one()
        return JSONResponse({"db": int(value)})

    _DEFAULT_USER_SLUG = "levon"

    async def _resolve_user_uuid(session: AsyncSession, slug: str) -> uuid.UUID:
        row = (
            await session.execute(select(User).where(User.user_id == slug))
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail=f"User not found: {slug}")
        return row.id

    @app.get("/api/sources")
    async def get_sources(session: AsyncSession = Depends(get_session)) -> JSONResponse:
        user_uuid = await _resolve_user_uuid(session, _DEFAULT_USER_SLUG)
        index = await index_sources(session, user_uuid)
        return JSONResponse([doc.model_dump() for doc in index.docs])

    @app.get("/api/runs")
    async def get_runs() -> JSONResponse:
        runs_dir = _resolve_user_root(root, _DEFAULT_USER_SLUG) / "resumes"
        if not runs_dir.exists():
            return JSONResponse([])
        summaries = [
            {
                "id": entry.name,
                "createdAt": _parse_run_id_to_iso(entry.name) or "",
                "label": _run_label(entry.name),
            }
            for entry in runs_dir.iterdir()
            if entry.is_dir()
        ]
        summaries.sort(key=lambda s: s["id"], reverse=True)
        return JSONResponse(summaries)

    @app.get("/api/runs/{run_id}/artifacts")
    async def get_artifacts(run_id: str) -> JSONResponse:
        run_dir = _resolve_user_root(root, _DEFAULT_USER_SLUG) / "resumes" / run_id
        if not run_dir.exists():
            raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")
        return JSONResponse(
            {
                "id": run_id,
                "jobAnalysis": _read_optional_json(run_dir / "inputs" / "job_analysis.json"),
                "retrievalCandidates": _read_optional_json(
                    run_dir / "inputs" / "retrieval_candidates.json"
                ),
                "rankedSources": _read_optional_json(run_dir / "inputs" / "ranked_sources.json"),
                "latex": _read_optional_text(run_dir / "resume.tex"),
            }
        )

    @app.get("/api/runs/{run_id}/pdf")
    async def get_pdf(run_id: str) -> FileResponse:
        pdf_path = (
            _resolve_user_root(root, _DEFAULT_USER_SLUG) / "resumes" / run_id / "resume.pdf"
        )
        if not pdf_path.exists():
            raise HTTPException(status_code=404, detail=f"PDF not found for run: {run_id}")
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=f"{run_id}.pdf",
            headers={"Content-Disposition": f'inline; filename="{run_id}.pdf"'},
        )

    @app.post("/api/run")
    async def post_run(
        request: Request, session: AsyncSession = Depends(get_session)
    ) -> Response:
        try:
            body = await request.json()
        except (ValueError, json.JSONDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        job_description = body.get("jobDescription") if isinstance(body, dict) else None
        if not isinstance(job_description, str) or not job_description.strip():
            raise HTTPException(status_code=400, detail="jobDescription is required")
        raw_company = body.get("companyHint") if isinstance(body, dict) else None
        raw_focus = body.get("focusHint") if isinstance(body, dict) else None
        company_hint = raw_company if isinstance(raw_company, str) and raw_company else None
        focus_hint = raw_focus if isinstance(raw_focus, str) and raw_focus else None

        user_uuid = await _resolve_user_uuid(session, _DEFAULT_USER_SLUG)
        user_root = _resolve_user_root(root, _DEFAULT_USER_SLUG)

        return StreamingResponse(
            _streaming_pipeline(
                repo_root=root,
                user_root=user_root,
                session_factory=app.state.session_factory,
                user_id_uuid=user_uuid,
                job_text=job_description,
                company_hint=company_hint,
                focus_hint=focus_hint,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    static_mime = {
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".ico": "image/x-icon",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".json": "application/json; charset=utf-8",
        ".map": "application/json; charset=utf-8",
    }

    @app.get("/{full_path:path}")
    async def serve_static(full_path: str) -> Response:
        dist_dir = _frontend_dist_dir(root)
        index_path = dist_dir / "index.html"

        if full_path:
            ext = Path(full_path).suffix.lower()
            if ext and ext in static_mime:
                safe_parts = [p for p in full_path.lstrip("/").split("/") if p != ".."]
                candidate = dist_dir.joinpath(*safe_parts) if safe_parts else dist_dir
                try:
                    candidate_resolved = candidate.resolve()
                    dist_resolved = dist_dir.resolve()
                    if (
                        candidate_resolved.is_file()
                        and dist_resolved in candidate_resolved.parents
                    ):
                        return FileResponse(candidate_resolved, media_type=static_mime[ext])
                except OSError:
                    pass

        if index_path.exists():
            return FileResponse(
                index_path,
                media_type="text/html; charset=utf-8",
                headers={"Cache-Control": "no-cache"},
            )
        return Response(
            f"Frontend build not found at {dist_dir}. Run `make web` first.",
            status_code=404,
            media_type="text/plain; charset=utf-8",
        )

    return app


app = create_app()


def main() -> None:
    import uvicorn

    port = int(os.environ.get("PORT", "3001"))
    repo_root = _resolve_repo_root()
    dist_dir = _frontend_dist_dir(repo_root)
    print(f"Web server listening on http://localhost:{port}")
    print(f"  - REST:   http://localhost:{port}/api/sources")
    print(f"  - Static: {dist_dir}")
    uvicorn.run(
        "resume_orchestrator.api:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
