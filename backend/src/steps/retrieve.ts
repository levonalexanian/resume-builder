import fs from "node:fs/promises";
import path from "node:path";
import { JobAnalysisSchema } from "../schemas/jobAnalysis.js";
import { RetrievalCandidates, RetrievalCandidatesSchema } from "../schemas/retrievalCandidates.js";
import { indexSources } from "../sources/indexSources.js";
import { runRetrieveQuery } from "../graph/queries.js";
import type { SourceFilter } from "../graph/schema.js";
import { ensureDir } from "../util/fsUtil.js";
import { nowIso } from "../util/timeUtil.js";

export type RetrieveStepOpts = {
  repoRoot: string;
  runDir: string;
};

export type RetrieveStepResult = {
  retrievalCandidatesPath: string;
  candidateCount: number;
};

export async function retrieveStep(opts: RetrieveStepOpts): Promise<RetrieveStepResult> {
  const inputsDir = path.join(opts.runDir, "inputs");
  await ensureDir(inputsDir);

  const jobAnalysisPath = path.join(inputsDir, "job_analysis.json");
  const raw = await fs.readFile(jobAnalysisPath, "utf8");
  const analysis = JobAnalysisSchema.parse(JSON.parse(raw));

  const index = await indexSources({ root: opts.repoRoot });

  const filter: SourceFilter = {
    kinds: analysis.tagsForGraphQL.kinds,
    groups: analysis.tagsForGraphQL.groups.length > 0 ? analysis.tagsForGraphQL.groups : undefined,
    tags: analysis.tagsForGraphQL.stack.length > 0 ? analysis.tagsForGraphQL.stack : undefined
  };

  const { result, matchedFiltersById, variables, operation } = await runRetrieveQuery({ index, filter });

  if (result.errors && result.errors.length > 0) {
    throw new Error(`GraphQL retrieve errors: ${result.errors.map((e) => e.message).join("; ")}`);
  }

  let sources = result.data?.sources ?? [];

  // If tag/group filters yielded nothing, fall back to all in-kind sources so
  // ranking still has something to score. The candidate audit records the
  // fallback so reviewers can see retrieval emptied out.
  let fallback = false;
  if (sources.length === 0) {
    const fallbackResult = await runRetrieveQuery({
      index,
      filter: { kinds: analysis.tagsForGraphQL.kinds }
    });
    sources = fallbackResult.result.data?.sources ?? [];
    fallback = true;
  }

  const candidates: RetrievalCandidates = RetrievalCandidatesSchema.parse({
    schemaVersion: 1,
    generatedAt: nowIso(),
    query: {
      operation,
      variables: variables as Record<string, unknown>
    },
    candidates: sources.map((s) => ({
      id: s.id,
      path: s.path,
      kind: s.kind,
      group: s.group,
      title: s.title,
      tags: s.tags,
      matchedFilters: fallback ? ["fallback:kind-only"] : matchedFiltersById.get(s.id) ?? []
    }))
  });

  const retrievalCandidatesPath = path.join(inputsDir, "retrieval_candidates.json");
  await fs.writeFile(retrievalCandidatesPath, JSON.stringify(candidates, null, 2) + "\n", "utf8");

  return { retrievalCandidatesPath, candidateCount: candidates.candidates.length };
}
