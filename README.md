# Resume Builder

Generate tailored one-page LaTeX/PDF resumes from structured Markdown sources
and a job description using a deterministic four-step pipeline (with optional
LLM steps), driven from a small web UI.

## What's in this repo

- `experience/`, `education/`, `projects/` — source-of-truth Markdown
- `templates/`
  - `resume_template.tex` — Mustache LaTeX template
  - `search.prompt.md` — Step 1 prompt (job analysis)
  - `generate.prompt.md` — Step 4 prompt (resume drafting)
- `scripts/latex_to_pdf` — `.tex` → `.pdf` build helper
- `backend/` — TypeScript HTTP server (REST + SSE + GraphQL) wrapping the pipeline
- `frontend/` — React + Tailwind web UI (served by the backend in production)
- `resumes/<YYYYMMDDHHMM>_<company>_<focus>/` — per-run artifacts (gitignored)

## Dev container (no host installs)

The repo ships with a pinned dev container. Everything you need to develop
and run the app locally is provided inside the container:

- Debian 12 base image
- TeX Live (`latexmk`, `pdflatex`)
- Node.js 22 LTS, npm 10.9.0
- Backend + frontend dependencies (installed automatically via
  `postCreateCommand`)

You can drive the container two ways:

### From VS Code

Open the repo and pick "Reopen in Container" / "Rebuild Container" after
pulling changes that touch `.devcontainer/`. The `postCreateCommand` runs
`npm install` in both `backend/` and `frontend/` for you.

### From a host terminal (no VS Code)

A `docker-compose.yml` + `Makefile` wrap the same Dockerfile so every
toolchain command runs inside the container. The only host requirements are
Docker Engine and Docker Compose v2.

```bash
make image-build  # build the dev image (one-time / after Dockerfile changes)
make install      # npm install in backend/ and frontend/
make typecheck    # tsc --noEmit on backend and frontend
make test         # vitest run (backend)
make web          # build the frontend and serve the web app on :3001
make sh           # interactive shell in the container
```

`make help` lists every target. The compose file bind-mounts the repo into
`/home/vscode/workspace` so edits are reflected immediately and outputs land
on the host.

## One-time setup

```bash
cp resume.config.json.example resume.config.json
cp .env.example .env
```

Edit `resume.config.json` for contact info and (optionally) `skillsLatex`.
Edit `.env` to toggle Perplexity research / LLM drafting (off by default).

Both files are gitignored.

## Quick start

```bash
make image-build   # once
make install       # once (or after dependency changes)
make web           # builds the frontend, then serves on :3001
```

Open <http://localhost:3001>, paste a job description into the form, and
click **Generate resume**. The page streams per-step progress (analyze →
retrieve → rank → draft → pdf) and offers a PDF download + artifact viewer
when the run finishes. Past runs are listed in the right column and can be
re-opened anytime.

## The four-step pipeline

Every web run executes the same deterministic pipeline:

```
job description (from the form)
  │
  ▼
Step 1: analyze  ─►  inputs/job_analysis.json
  │                  (Perplexity if RESUME_USE_PERPLEXITY_RESEARCH=true,
  │                   otherwise a manual prompt + stub JSON)
  ▼
Step 2: retrieve ─►  inputs/retrieval_candidates.json
  │                  (GraphQL over a typed schema backed by the Markdown index;
  │                   filters by kinds/groups/tags from tagsForGraphQL)
  ▼
Step 3: rank     ─►  inputs/ranked_sources.json
  │                  (relevancy from token overlap + freshness from parsed
  │                   duration; combined via configurable weights)
  ▼
Step 4: draft    ─►  resume.tex
  │                  (deterministic Mustache render by default; LLM-backed
  │                   when RESUME_USE_LLM_DRAFT=true)
  ▼
       pdf        ─►  resume.pdf  (via scripts/latex_to_pdf)
```

Each run gets its own directory under `resumes/<slug>/` containing:

| Path                                  | Step | Purpose                                    |
| ------------------------------------- | ---- | ------------------------------------------ |
| `inputs/<job basename>`               | —    | Verbatim copy of the input job description |
| `inputs/job_analysis.json`            | 1    | Structured job analysis                    |
| `inputs/job_analysis.MANUAL.md`       | 1    | Manual fallback prompt (off-toggle only)   |
| `inputs/retrieval_candidates.json`    | 2    | GraphQL retrieval audit                    |
| `inputs/ranked_sources.json`          | 3    | Per-bullet relevancy + freshness scores    |
| `inputs/template.tex`                 | 4    | Copy of the Mustache template              |
| `inputs/resume.config.json`           | 4    | Copy of contact/skills config              |
| `context/**/*.md`                     | 4    | Mirror of every evidence file              |
| `resume.tex`                          | 4    | Generated LaTeX                            |
| `resume.pdf`                          | pdf  | Compiled PDF                               |
| `build.log`                           | pdf  | `latexmk` / `pdflatex` output              |

## HTTP API

The backend exposes a small REST surface (used by the frontend) plus the
GraphQL schema:

| Method + path                     | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `GET  /api/sources`               | All indexed `SourceDoc`s                  |
| `GET  /api/runs`                  | Past run summaries (newest first)         |
| `GET  /api/runs/:id/artifacts`    | `job_analysis`, `ranked_sources`, LaTeX   |
| `GET  /api/runs/:id/pdf`          | Streamed `application/pdf`                |
| `POST /api/run`                   | SSE stream of pipeline events             |
| `*    /graphql`                   | Yoga GraphQL endpoint (same schema as Step 2) |

## Environment toggles

Loaded from repo-root `.env` (see [`.env.example`](.env.example)). Process
environment variables override file values.

| Toggle                              | Behavior when `false` (default)                       | Behavior when `true`                                                  |
| ----------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `RESUME_USE_PERPLEXITY_RESEARCH`    | Step 1 writes a manual prompt + stub `job_analysis.json` | Calls Perplexity with the search prompt; requires `PERPLEXITY_API_KEY` |
| `RESUME_USE_LLM_RERANK`             | Step 3 uses deterministic relevancy + freshness only  | _(reserved; rerank pass not yet wired)_                               |
| `RESUME_USE_LLM_DRAFT`              | Step 4 fills the template deterministically           | Calls `RESUME_DRAFT_PROVIDER` (`openai`, `anthropic`, or `google`)    |

When a toggle is on but the required key is missing the run fails fast with
a clear error event in the SSE stream.

## Manual Step 1

If `RESUME_USE_PERPLEXITY_RESEARCH=false`, the analyze step writes
`inputs/job_analysis.MANUAL.md` with the rendered search prompt. Paste it
into Perplexity (or any chat UI), save the JSON response over
`inputs/job_analysis.json` in the run directory, then re-run from the web
UI — the existing analysis will be reused.

## GraphQL retrieval layer

Step 2 runs operations against an in-process GraphQL schema with these
fields:

```graphql
type Query {
  sources(filter: SourceFilter): [SourceDoc!]!
  experienceGroups(filter: SourceFilter): [ExperienceGroup!]!
  education(filter: SourceFilter): [SourceDoc!]!
  projects(filter: SourceFilter): [SourceDoc!]!
}

input SourceFilter {
  kinds: [Kind!]
  groups: [String!]
  tags: [String!]
}
```

The same schema is exposed at `/graphql` while the web server is running,
so you can poke at it with any GraphQL client (e.g. `curl`, GraphiQL, or
the Yoga playground at <http://localhost:3001/graphql>).

## Adding source content

Author Markdown files under `experience/<group>/<focus>.md`,
`education/<group>/overview.md`, or `projects/<slug>.md`.

Each experience group should have an `overview.md` with metadata bullets
that the indexer normalizes:

```md
## Company Name

- **Position:** Software Engineer
- **Location:** City, Region, Country
- **Duration:** Month YYYY – Month YYYY   (or "Present")
```

The duration string drives the **freshness** score in Step 3, so use
parseable months/years.

## Tests + typecheck

```bash
make typecheck   # backend + frontend
make test        # backend (vitest)
```

## Troubleshooting

- **`latex build failed`** — open `<runDir>/build.log`; missing TeX
  packages mean the dev container needs to be rebuilt.
- **`MissingApiKeyError`** — a toggle is on without its API key in
  `.env`. Set the key or flip the toggle off.
- **Empty experience section** — usually means the indexer found no
  bullets matching the job tokens; tweak `tagsForTokenization` in the
  manual `job_analysis.json` or improve the job description.
