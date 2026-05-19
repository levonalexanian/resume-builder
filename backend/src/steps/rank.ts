import fs from "node:fs/promises";
import path from "node:path";
import { JobAnalysisSchema } from "../schemas/jobAnalysis.js";
import { RetrievalCandidatesSchema } from "../schemas/retrievalCandidates.js";
import { RankedEntry, RankedSources, RankedSourcesSchema, RankedBullet } from "../schemas/rankedSources.js";
import { indexSources } from "../sources/indexSources.js";
import type { SourceDoc, SourcesIndex } from "../sources/types.js";
import { ensureDir } from "../util/fsUtil.js";
import { freshnessScore } from "../util/dateUtil.js";
import { tokenize } from "../util/textUtil.js";
import { nowIso } from "../util/timeUtil.js";

export type RankStepOpts = {
  repoRoot: string;
  runDir: string;
  jobPath: string;
  weights?: { relevancy: number; freshness: number };
  now?: Date;
};

const DEFAULT_WEIGHTS = { relevancy: 0.75, freshness: 0.25 } as const;

function scoreText(jobTokens: Set<string>, text: string, tags: string[]): number {
  let score = 0;
  for (const tok of tokenize(text)) if (jobTokens.has(tok)) score += 1;
  for (const tag of tags) if (jobTokens.has(tag)) score += 3;
  return score;
}

function normalize(values: number[]): number[] {
  const max = Math.max(0, ...values);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => v / max);
}

function rankExperience(args: {
  index: SourcesIndex;
  candidateIds: Set<string>;
  jobTokens: Set<string>;
  weights: { relevancy: number; freshness: number };
  now: Date;
}): RankedEntry[] {
  const expDocs = args.index.docs.filter((d) => d.kind === "experience" && args.candidateIds.has(d.id));
  const byKey = new Map<string, SourceDoc[]>();
  for (const d of expDocs) {
    const list = byKey.get(d.groupKey) ?? [];
    list.push(d);
    byKey.set(d.groupKey, list);
  }

  const groups: Array<{
    overview: SourceDoc | undefined;
    docs: SourceDoc[];
    rawRelevancy: number;
    rawFreshness: number;
    bulletsRaw: Array<{ text: string; evidence: string[]; relevancy: number; freshness: number }>;
  }> = [];

  for (const [, docs] of byKey) {
    const overview = docs.find((d) => /\/overview\.md$/i.test(d.path));
    const rawRelevancy = Math.max(
      ...docs.map((d) => scoreText(args.jobTokens, [d.title, d.text, ...d.bullets].join("\n"), d.tags))
    );
    const rawFreshness = freshnessScore(overview?.meta.duration, args.now);

    const bulletsRaw: Array<{ text: string; evidence: string[]; relevancy: number; freshness: number }> = [];
    for (const d of docs) {
      const docFreshness = freshnessScore(d.meta.duration ?? overview?.meta.duration, args.now);
      for (const b of d.bullets) {
        const r = scoreText(args.jobTokens, b, d.tags);
        if (r <= 0) continue;
        bulletsRaw.push({ text: b, evidence: [d.path], relevancy: r, freshness: docFreshness });
      }
    }

    groups.push({ overview, docs, rawRelevancy, rawFreshness, bulletsRaw });
  }

  const normRel = normalize(groups.map((g) => g.rawRelevancy));

  return groups.map((g, i) => {
    const relevancy = normRel[i];
    const freshness = g.rawFreshness;
    const score = args.weights.relevancy * relevancy + args.weights.freshness * freshness;

    const bulletRelNorm = normalize(g.bulletsRaw.map((b) => b.relevancy));
    const bullets: RankedBullet[] = g.bulletsRaw
      .map((b, j) => {
        const br = bulletRelNorm[j];
        const bf = b.freshness;
        return {
          text: b.text,
          evidence: b.evidence,
          relevancy: br,
          freshness: bf,
          score: args.weights.relevancy * br + args.weights.freshness * bf
        };
      })
      .sort((a, b) => b.score - a.score);

    const overview = g.overview;
    const repDoc: SourceDoc = overview ?? g.docs[0];
    return {
      id: repDoc.id,
      kind: "experience" as const,
      group: repDoc.group,
      title: overview?.title ?? repDoc.title,
      role: overview?.meta.role,
      location: overview?.meta.location,
      duration: overview?.meta.duration,
      relevancy,
      freshness,
      score,
      evidence: [...new Set(g.docs.map((d) => d.path))],
      bullets
    };
  }).sort((a, b) => b.score - a.score);
}

function rankEducation(args: {
  index: SourcesIndex;
  candidateIds: Set<string>;
  jobTokens: Set<string>;
  weights: { relevancy: number; freshness: number };
  now: Date;
}): RankedEntry[] {
  const eduDocs = args.index.docs.filter((d) => d.kind === "education" && args.candidateIds.has(d.id));
  const overviews = eduDocs.filter((d) => /\/overview\.md$/i.test(d.path));

  const raw = overviews.map((d) => {
    const r = scoreText(args.jobTokens, [d.title, d.text].join("\n"), d.tags);
    const f = freshnessScore(d.meta.duration, args.now);
    return { d, r, f };
  });
  const normR = normalize(raw.map((x) => x.r));

  return raw.map(({ d, f }, i) => {
    const r = normR[i];
    return {
      id: d.id,
      kind: "education" as const,
      group: d.group,
      title: d.title,
      location: d.meta.location,
      duration: d.meta.duration,
      diploma: d.meta.diploma,
      gpa: d.meta.gpa,
      relevancy: r,
      freshness: f,
      score: args.weights.relevancy * r + args.weights.freshness * f,
      evidence: [d.path],
      bullets: []
    };
  }).sort((a, b) => b.score - a.score);
}

function rankProjects(args: {
  index: SourcesIndex;
  candidateIds: Set<string>;
  jobTokens: Set<string>;
  weights: { relevancy: number; freshness: number };
  now: Date;
}): RankedEntry[] {
  const projDocs = args.index.docs.filter((d) => d.kind === "project" && args.candidateIds.has(d.id));
  const raw = projDocs.map((d) => {
    const r = scoreText(args.jobTokens, [d.title, d.text, ...d.bullets].join("\n"), d.tags);
    const f = freshnessScore(d.meta.duration, args.now);
    return { d, r, f };
  });
  const normR = normalize(raw.map((x) => x.r));
  return raw.map(({ d, f }, i) => {
    const r = normR[i];
    return {
      id: d.id,
      kind: "project" as const,
      group: d.group,
      title: d.title,
      location: d.meta.location,
      duration: d.meta.duration,
      relevancy: r,
      freshness: f,
      score: args.weights.relevancy * r + args.weights.freshness * f,
      evidence: [d.path],
      bullets: d.bullets.map((b): RankedBullet => ({
        text: b,
        evidence: [d.path],
        relevancy: 1,
        freshness: f,
        score: 1
      }))
    };
  }).sort((a, b) => b.score - a.score);
}

export type RankStepResult = { rankedSourcesPath: string };

export async function rankStep(opts: RankStepOpts): Promise<RankStepResult> {
  const inputsDir = path.join(opts.runDir, "inputs");
  await ensureDir(inputsDir);

  const analysisPath = path.join(inputsDir, "job_analysis.json");
  const candidatesPath = path.join(inputsDir, "retrieval_candidates.json");

  const analysis = JobAnalysisSchema.parse(JSON.parse(await fs.readFile(analysisPath, "utf8")));
  const candidates = RetrievalCandidatesSchema.parse(JSON.parse(await fs.readFile(candidatesPath, "utf8")));

  const index = await indexSources({ root: opts.repoRoot });
  const candidateIds = new Set(candidates.candidates.map((c) => c.id));

  const jobText = await fs.readFile(opts.jobPath, "utf8");
  const jobTokens = new Set<string>(tokenize(jobText));
  for (const t of analysis.tagsForTokenization) {
    for (const tok of tokenize(t)) jobTokens.add(tok);
    jobTokens.add(t.toLowerCase());
  }

  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const now = opts.now ?? new Date();

  const experience = rankExperience({ index, candidateIds, jobTokens, weights, now });
  const education = rankEducation({ index, candidateIds, jobTokens, weights, now });
  const projects = rankProjects({ index, candidateIds, jobTokens, weights, now });

  const ranked: RankedSources = RankedSourcesSchema.parse({
    schemaVersion: 1,
    generatedAt: nowIso(),
    job: {
      path: path.relative(opts.repoRoot, opts.jobPath),
      company: analysis.tagsForGraphQL.company,
      focus: analysis.tagsForGraphQL.roleFamily
    },
    weights,
    experience,
    education,
    projects
  });

  const rankedSourcesPath = path.join(inputsDir, "ranked_sources.json");
  await fs.writeFile(rankedSourcesPath, JSON.stringify(ranked, null, 2) + "\n", "utf8");

  return { rankedSourcesPath };
}
