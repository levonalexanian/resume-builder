import fs from "node:fs/promises";
import path from "node:path";
import { JobAnalysisSchema } from "../schemas/jobAnalysis.js";
import { inferCompany, inferFocus } from "../sources/selectSources.js";
import { analyzeStep } from "../steps/analyze.js";
import { retrieveStep } from "../steps/retrieve.js";
import { rankStep } from "../steps/rank.js";
import { draftStep } from "../steps/draft.js";
import { pdfStep } from "../steps/pdf.js";
import { loadResumeEnv } from "../util/env.js";
import { ensureDir } from "../util/fsUtil.js";
import { safeBasename } from "../util/textUtil.js";
import { nowRunId } from "../util/timeUtil.js";

export type RunPipelineOpts = {
  repoRoot: string;
  jobPath: string;
  outDir: string;
  configPath: string;
  templatePath: string;
  company?: string;
  focus?: string;
  buildPdf: boolean;
  maxExperiences: number;
  maxBulletsPerExperience: number;
};

export type RunPipelineResult = {
  runDir: string;
  jobAnalysisPath: string;
  retrievalCandidatesPath: string;
  rankedSourcesPath: string;
  resumeTexPath: string;
  resumePdfPath?: string;
  buildLogPath?: string;
  draftVia: "deterministic" | "llm";
};

function deriveRunSlug(company: string | undefined, focus: string | undefined): string {
  const base = safeBasename(company ?? "run");
  const tail = focus ? `_${safeBasename(focus)}` : "";
  return `${nowRunId()}_${base}${tail}`;
}

async function mirrorContext(repoRoot: string, rankedSourcesPath: string, contextDir: string): Promise<void> {
  const raw = await fs.readFile(rankedSourcesPath, "utf8");
  const ranked = JSON.parse(raw) as {
    experience?: Array<{ evidence?: string[] }>;
    education?: Array<{ evidence?: string[] }>;
    projects?: Array<{ evidence?: string[] }>;
  };
  const paths = new Set<string>();
  for (const list of [ranked.experience ?? [], ranked.education ?? [], ranked.projects ?? []]) {
    for (const entry of list) for (const p of entry.evidence ?? []) paths.add(p);
  }
  await ensureDir(contextDir);
  for (const rel of paths) {
    const abs = path.join(repoRoot, rel);
    const dest = path.join(contextDir, rel);
    try {
      await ensureDir(path.dirname(dest));
      await fs.copyFile(abs, dest);
    } catch {
      // Skip missing files; the rank output already has evidence paths.
    }
  }
}

export async function runPipeline(opts: RunPipelineOpts): Promise<RunPipelineResult> {
  const env = await loadResumeEnv(opts.repoRoot);

  const jobText = await fs.readFile(opts.jobPath, "utf8");
  const fallbackCompany = opts.company ?? inferCompany(jobText);
  const fallbackFocus = opts.focus ?? inferFocus(jobText);
  const provisionalSlug = deriveRunSlug(fallbackCompany, fallbackFocus);
  const runDir = path.join(opts.outDir, provisionalSlug);
  await ensureDir(path.join(runDir, "inputs"));
  await ensureDir(path.join(runDir, "context"));

  const jobCopyPath = path.join(runDir, "inputs", path.basename(opts.jobPath));
  await fs.copyFile(opts.jobPath, jobCopyPath);

  const analyze = await analyzeStep({
    repoRoot: opts.repoRoot,
    jobPath: opts.jobPath,
    runDir,
    env
  });

  // Refine slug from analysis (company / roleFamily) if user did not override
  // and analysis filled them in (Perplexity path).
  let finalRunDir = runDir;
  if (!opts.company || !opts.focus) {
    try {
      const analysis = JobAnalysisSchema.parse(JSON.parse(await fs.readFile(analyze.jobAnalysisPath, "utf8")));
      const inferredCompany = opts.company ?? analysis.tagsForGraphQL.company ?? fallbackCompany;
      const inferredFocus = opts.focus ?? analysis.tagsForGraphQL.roleFamily ?? fallbackFocus;
      const newSlug = deriveRunSlug(inferredCompany, inferredFocus);
      if (newSlug !== provisionalSlug) {
        finalRunDir = path.join(opts.outDir, newSlug);
        await ensureDir(finalRunDir);
        await fs.rename(runDir, finalRunDir);
      }
    } catch {
      // analyze must have written something; if not, keep provisional dir
    }
  }

  const retrieve = await retrieveStep({ repoRoot: opts.repoRoot, runDir: finalRunDir });
  const rank = await rankStep({
    repoRoot: opts.repoRoot,
    runDir: finalRunDir,
    jobPath: opts.jobPath
  });
  await mirrorContext(opts.repoRoot, rank.rankedSourcesPath, path.join(finalRunDir, "context"));

  const draft = await draftStep({
    repoRoot: opts.repoRoot,
    runDir: finalRunDir,
    jobPath: opts.jobPath,
    configPath: opts.configPath,
    templatePath: opts.templatePath,
    maxExperiences: opts.maxExperiences,
    maxBulletsPerExperience: opts.maxBulletsPerExperience,
    env
  });

  let resumePdfPath: string | undefined;
  let buildLogPath: string | undefined;
  if (opts.buildPdf) {
    const pdf = await pdfStep({ repoRoot: opts.repoRoot, runDir: finalRunDir });
    resumePdfPath = pdf.resumePdfPath;
    buildLogPath = pdf.buildLogPath;
  }

  // Drop retrieval-only path with new path post-rename.
  return {
    runDir: finalRunDir,
    jobAnalysisPath: path.join(finalRunDir, "inputs", "job_analysis.json"),
    retrievalCandidatesPath: path.join(finalRunDir, "inputs", "retrieval_candidates.json"),
    rankedSourcesPath: path.join(finalRunDir, "inputs", "ranked_sources.json"),
    resumeTexPath: path.join(finalRunDir, "resume.tex"),
    resumePdfPath,
    buildLogPath,
    draftVia: draft.via
  };
}
