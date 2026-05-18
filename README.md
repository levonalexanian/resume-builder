# Resume Builder

Generate tailored one-page LaTeX/PDF resumes from structured Markdown sources
and a job description using a deterministic four-step pipeline (with optional
LLM steps).

## What's in this repo

- `experience/`, `education/`, `projects/` — source-of-truth Markdown
- `templates/`
  - `resume_template.tex` — Mustache LaTeX template
  - `search.prompt.md` — Step 1 prompt (job analysis)
  - `generate.prompt.md` — Step 4 prompt (resume drafting)
- `scripts/latex_to_pdf` — `.tex` → `.pdf` build helper
- `tools/orchestrator/` — TypeScript CLI and GraphQL layer
- `resumes/<YYYYMMDDHHMM>_<company>_<focus>/` — per-run artifacts (gitignored)

## Dev container (no host installs)

The repo ships with a pinned dev container. Everything you need to develop,
build, and run the pipeline locally is provided inside the container:

- Debian 12 base image
- TeX Live (`latexmk`, `pdflatex`)
- Node.js 22 LTS, npm 10.9.0
- Resume orchestrator dependencies (installed automatically via
  `postCreateCommand`)

Open the repo in "Reopen in Container" / "Rebuild Container" after pulling
changes that touch `.devcontainer/`.

## One-time setup

```bash
cp resume.config.json.example resume.config.json
cp .env.example .env
```

Edit `resume.config.json` for contact info and (optionally) `skillsLatex`.
Edit `.env` to toggle Perplexity research / LLM drafting (off by default).

Both files are gitignored.

## The four-step pipeline

```
job.md
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

## Quick start

The fastest path is the chained `run` command:

```bash
cd tools/orchestrator
npm install
npm run build

cd ../..
node tools/orchestrator/dist/cli.js run --job path/to/job.md
```

That writes `resumes/<YYYYMMDDHHMM>_<company>_<focus>/resume.pdf` (plus all
audit artifacts).

To skip the PDF compile (e.g. for fast iteration):

```bash
node tools/orchestrator/dist/cli.js run --job path/to/job.md --no-pdf
```

To force a deterministic-only render that never invokes any LLM, use
`generate` (an alias for `run` with `RESUME_USE_LLM_DRAFT=false`):

```bash
node tools/orchestrator/dist/cli.js generate --job path/to/job.md
```

## Running steps individually

You can also drive each step yourself; later steps read artifacts from the
run directory written by earlier ones.

```bash
# Step 1 — analyze (creates a new run dir under resumes/)
node tools/orchestrator/dist/cli.js analyze \
  --job path/to/job.md \
  --outDir resumes

# Take the runDir from the previous step's JSON output:
RUN=resumes/202605121452_amd_firmware

# Step 2 — retrieve via GraphQL
node tools/orchestrator/dist/cli.js retrieve --run "$RUN"

# Step 3 — rank with relevancy + freshness
node tools/orchestrator/dist/cli.js rank --run "$RUN" --job path/to/job.md

# Step 4 — draft resume.tex (and optionally PDF)
node tools/orchestrator/dist/cli.js draft --run "$RUN" --job path/to/job.md --pdf

# Or, if resume.tex already exists in the run dir:
node tools/orchestrator/dist/cli.js pdf --run "$RUN"
```

## Environment toggles

Loaded from repo-root `.env` (see [`.env.example`](.env.example)). Process
environment variables override file values.

| Toggle                              | Behavior when `false` (default)                       | Behavior when `true`                                                  |
| ----------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `RESUME_USE_PERPLEXITY_RESEARCH`    | Step 1 writes a manual prompt + stub `job_analysis.json` | Calls Perplexity with the search prompt; requires `PERPLEXITY_API_KEY` |
| `RESUME_USE_LLM_RERANK`             | Step 3 uses deterministic relevancy + freshness only  | _(reserved; rerank pass not yet wired)_                               |
| `RESUME_USE_LLM_DRAFT`              | Step 4 fills the template deterministically           | Calls `RESUME_DRAFT_PROVIDER` (`openai`, `anthropic`, or `google`)    |

When a toggle is on but the required key is missing the CLI fails fast with
a clear error.

## Manual Step 1

If `RESUME_USE_PERPLEXITY_RESEARCH=false`, the `analyze` step writes
`inputs/job_analysis.MANUAL.md` with the rendered search prompt. Paste it
into Perplexity (or any chat UI), save the JSON response over
`inputs/job_analysis.json`, then run `retrieve` / `rank` / `draft`.

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

You can also serve the same schema over HTTP for ad-hoc inspection
(GraphQL Yoga + Prisma-style resolvers are a documented future swap):

```bash
cd tools/orchestrator
RESUME_REPO_ROOT=/workspaces/Resume PORT=4000 npm run graphql:serve
# then visit http://localhost:4000/graphql
```

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
cd tools/orchestrator
npm run typecheck
npm test
```

## Troubleshooting

- **`latex build failed`** — open `<runDir>/build.log`; missing TeX
  packages mean the dev container needs to be rebuilt.
- **`MissingApiKeyError`** — a toggle is on without its API key in
  `.env`. Set the key or flip the toggle off.
- **Empty experience section** — usually means the indexer found no
  bullets matching the job tokens; tweak `tagsForTokenization` in the
  manual `job_analysis.json` or improve the job description.
