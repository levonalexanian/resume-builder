# Resume Builder

> **Status: Work in progress.** Expect rough edges, frequent breaking changes, and gaps in the docs. The pieces below describe the project as it stands today.

A small web app for generating tailored one-page LaTeX/PDF resumes from structured Markdown sources stored in Postgres. Paste a job description into the UI, pick a user, and a deterministic pipeline (with optional LLM steps) picks the most relevant content, drafts the LaTeX, and compiles the PDF.

## Structure

- `backend/` — Python (FastAPI + Pydantic + SQLAlchemy 2.0 async) HTTP server with REST + SSE endpoints. Source content (markdown bodies, user profile/skills) and run metadata live in Postgres; generated artifacts (PDF, .tex, build.log, intermediate JSON) live on the filesystem under `users/<user_id>/resumes/<run_id>/`. Entry point: `backend/src/resume_orchestrator/api.py`.
- `prisma/` — Prisma schema (`schema.prisma`) and SQL migrations. Source-of-truth for the Postgres schema.
- `frontend/` — React + Tailwind UI with a user picker. Every API call is scoped to `/api/users/{user_id}/...`.
- `templates/` — LaTeX template + prompt templates used by the pipeline.
- `scripts/latex_to_pdf` — `.tex` → `.pdf` build helper invoked by the pipeline.
- `users/<user_id>/resumes/<YYYYMMDDHHMM>_<company>_<focus>/` — one directory per pipeline run, with intermediate artifacts and the final `resume.pdf` (gitignored).
- `.devcontainer/` + `docker-compose.yml` + `Makefile` — host-side wrappers so the whole toolchain (Python 3.12 + uv, Node 22, TeX Live, latexmk, Postgres 16) stays inside Docker.

## Run it locally

You need [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2 on the host. Nothing else — no Node, no TeX, no npm, no Postgres.

```bash
git clone https://github.com/levonalexanian/resume-builder.git
cd resume-builder

cp .env.example .env                                # optional LLM/API keys (off by default)

make image-build   # build the dev container image (one-time, ~3–5 min)
make install       # uv sync in backend/ and npm install in frontend/
make db-upgrade    # run Prisma migrations against the bundled Postgres
make web           # build the frontend, then start the server on :3001
```

Open <http://localhost:3001>, pick a user from the dropdown, paste a job description, click **Generate resume**, and download the PDF when the run finishes. Past runs are listed in the right column and can be re-opened anytime.

User onboarding is not yet exposed in the UI — seed users directly in the `users` table for now (`make db-shell`).

`make help` shows the other targets (`typecheck`, `test`, `db-shell`, `db-migrate MSG=...`, `sh`, `down`, `clean`).
