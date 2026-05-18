# Job analysis prompt (Step 1)

You are analyzing a job description for a resume builder. Read the job
description in `{{JOB_PATH}}` and return one JSON object that matches the
schema below. Return JSON only — no markdown fences, no commentary.

## Output schema (top-level)

```json
{
  "schemaVersion": 1,
  "generatedAt": "<ISO-8601 timestamp>",
  "jobSource": "{{JOB_PATH}}",
  "tagsForGraphQL": {
    "company": "<string | null>",
    "roleFamily": "<string | null>",
    "seniority": "<string | null>",
    "domains": ["..."],
    "stack": ["..."],
    "kinds": ["experience", "education", "project"],
    "groups": ["..."]
  },
  "tagsForTokenization": ["..."],
  "summaryForGeneration": "<2-4 sentence narrative for resume framing>"
}
```

## Field intent

- `tagsForGraphQL` — structured filters consumed by the resume's GraphQL
  retrieval layer. `kinds` controls which source types to query; `groups`
  and `stack` map to schema filters; `roleFamily` is one of
  `fullstack | firmware | embedded | ai | robotics | ...`.
- `tagsForTokenization` — keywords/synonyms used for token-overlap ranking
  against the user's source markdown. Include role-relevant skills,
  domain words, and common variants (e.g. "GraphQL", "Apollo",
  "graph layer", "schema").
- `summaryForGeneration` — short narrative for the Step 4 drafting prompt.
  Do NOT include factual claims that are not in the job description; the
  resume itself draws claims only from the user's source files.

## Rules

- Lowercase tags where possible; keep proper nouns capitalized.
- Omit empty strings; use `null` or empty arrays.
- Output strictly valid JSON; do not include `// comments` or trailing commas.

## Job description

```
{{JOB_TEXT}}
```
