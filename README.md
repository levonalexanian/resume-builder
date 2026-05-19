# Resume Builder

> **Status: Work in progress.** Expect rough edges, frequent breaking changes, and gaps in the docs. The pieces below describe the project as it stands today.

A small web app for generating tailored one-page LaTeX/PDF resumes from structured Markdown sources. Paste a job description into the UI, and a deterministic pipeline (with optional LLM steps) picks the most relevant content, drafts the LaTeX, and compiles the PDF.

## Structure

- `experience/`, `education/`, `projects/` — source-of-truth Markdown for the things that can appear on a resume.
- `templates/` — LaTeX template + prompt templates used by the pipeline.
- `scripts/latex_to_pdf` — `.tex` → `.pdf` build helper invoked by the pipeline.
- `backend/` — TypeScript HTTP server (REST + SSE + GraphQL) that wraps the pipeline. Entry point: `backend/src/web/server.ts`.
- `frontend/` — React + Tailwind UI. Vite proxies `/api` and `/graphql` to the backend in dev; the backend serves the built bundle in production.
- `resumes/<YYYYMMDDHHMM>_<company>_<focus>/` — one directory per pipeline run, with intermediate artifacts and the final `resume.pdf` (gitignored).
- `.devcontainer/` + `docker-compose.yml` + `Makefile` — host-side wrappers so the whole toolchain (Node 22, TeX Live, latexmk, …) stays inside a Docker container.

## Run it locally

You need [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2 on the host. Nothing else — no Node, no TeX, no npm.

```bash
git clone https://github.com/levonalexanian/resume-builder.git
cd resume-builder

cp resume.config.json.example resume.config.json   # your contact info + skills
cp .env.example .env                                # optional LLM/API keys (off by default)

make image-build   # build the dev container image (one-time, ~3–5 min)
make install       # npm install in backend/ and frontend/
make web           # build the frontend, then start the server on :3001
```

Open <http://localhost:3001>, paste a job description into the form, click **Generate resume**, and download the PDF when the run finishes. Past runs are listed in the right column and can be re-opened anytime.

`make help` shows the other targets (`typecheck`, `test`, `sh`, `down`, `clean`).
