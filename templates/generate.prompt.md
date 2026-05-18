# Resume drafting prompt (Step 4)

You are authoring a single-page resume in LaTeX from the user's source
markdown plus a job-aware ranking.

## Inputs

- Job description (copied): `{{JOB_PATH}}`
- Context files (selected from ranked sources): `{{CONTEXT_DIR}}`
- LaTeX template: `inputs/template.tex` (Mustache delimiters `<<` `>>`)
- Resume config: `inputs/resume.config.json` (heading + optional skills)
- Step-1 narrative: `inputs/job_analysis.json` → `summaryForGeneration`
- Step-3 ranking: `inputs/ranked_sources.json`

## Sources to draw from

{{SOURCE_LIST}}

## Task

1. Read the job description, ranked sources, and the selected context files.
2. Produce `{{RUN_DIR}}/resume.tex` by filling the Mustache template at
   `inputs/template.tex`. Substitute every `<<NAME>>`, `<<EXPERIENCE_SECTION>>`,
   etc. with LaTeX-escaped content drawn from the user's sources.
3. Compile the LaTeX to a PDF using the repo script:

   ```bash
   ./scripts/latex_to_pdf {{RUN_DIR}}/resume.tex {{RUN_DIR}}/resume.pdf
   ```

## Constraints

- Every bullet must be backed by at least one context file (cite the
  evidence path inline in a comment if uncertain). Do not invent
  experience.
- Mirror the user's tone from their context files; do not soften phrasing.
- Keep the resume to one page when compiled at 11pt letter.
- Escape LaTeX special characters (`& % $ # _ { } ~ ^ \`).

## Audit trail

When done, leave the original `inputs/` artifacts untouched. The build
log will be written to `{{RUN_DIR}}/build.log` automatically.
