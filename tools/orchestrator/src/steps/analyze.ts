import fs from "node:fs/promises";
import path from "node:path";
import Mustache from "mustache";
import { JobAnalysis, JobAnalysisSchema } from "../schemas/jobAnalysis.js";
import { loadResumeEnv, MissingApiKeyError, ResumeEnv } from "../util/env.js";
import { ensureDir } from "../util/fsUtil.js";
import { nowIso } from "../util/timeUtil.js";
import { extractJsonObject, perplexityChat } from "../clients/perplexity.js";

export type AnalyzeStepOpts = {
  repoRoot: string;
  jobPath: string;
  runDir: string;
  env?: ResumeEnv;
};

export type AnalyzeStepResult = {
  jobAnalysisPath: string;
  manualPromptPath?: string;
  via: "perplexity" | "manual";
};

const SYSTEM_PROMPT =
  "You are a job-description analyst. You MUST output a single JSON object matching " +
  "the schema described in the user prompt and nothing else. No prose, no markdown fences.";

async function readSearchPromptTemplate(repoRoot: string): Promise<string> {
  const promptPath = path.join(repoRoot, "templates", "search.prompt.md");
  return fs.readFile(promptPath, "utf8");
}

function renderSearchPrompt(template: string, jobText: string, jobPath: string): string {
  return Mustache.render(
    template,
    { JOB_PATH: jobPath, JOB_TEXT: jobText },
    undefined,
    { escape: (v: unknown) => String(v) }
  );
}

export async function analyzeStep(opts: AnalyzeStepOpts): Promise<AnalyzeStepResult> {
  const env = opts.env ?? (await loadResumeEnv(opts.repoRoot));
  const inputsDir = path.join(opts.runDir, "inputs");
  await ensureDir(inputsDir);

  const jobText = await fs.readFile(opts.jobPath, "utf8");
  const jobRelPath = path.relative(opts.repoRoot, opts.jobPath);
  const template = await readSearchPromptTemplate(opts.repoRoot);
  const userPrompt = renderSearchPrompt(template, jobText, jobRelPath);

  const jobAnalysisPath = path.join(inputsDir, "job_analysis.json");

  if (env.RESUME_USE_PERPLEXITY_RESEARCH) {
    if (!env.PERPLEXITY_API_KEY) {
      throw new MissingApiKeyError("RESUME_USE_PERPLEXITY_RESEARCH", "PERPLEXITY_API_KEY");
    }
    const raw = await perplexityChat({
      apiKey: env.PERPLEXITY_API_KEY,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      responseFormat: "json_object"
    });
    const jsonText = extractJsonObject(raw);
    const parsed = JSON.parse(jsonText) as Partial<JobAnalysis>;
    const merged: JobAnalysis = JobAnalysisSchema.parse({
      schemaVersion: 1,
      generatedAt: nowIso(),
      jobSource: parsed.jobSource ?? jobRelPath,
      tagsForGraphQL: parsed.tagsForGraphQL ?? { domains: [], stack: [], kinds: ["experience", "education", "project"], groups: [] },
      tagsForTokenization: parsed.tagsForTokenization ?? [],
      summaryForGeneration: parsed.summaryForGeneration ?? "",
      rawProviderResponse: raw
    });
    await fs.writeFile(jobAnalysisPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
    return { jobAnalysisPath, via: "perplexity" };
  }

  const manualPromptPath = path.join(inputsDir, "job_analysis.MANUAL.md");
  const manualPrompt =
    "<!--\n" +
    "Manual Step 1: paste this prompt into Perplexity (or any chat UI),\n" +
    "then save the JSON response to inputs/job_analysis.json next to this file.\n" +
    "The CLI's `retrieve` and `rank` subcommands will pick it up automatically.\n" +
    "-->\n\n" +
    userPrompt;
  await fs.writeFile(manualPromptPath, manualPrompt, "utf8");

  try {
    await fs.access(jobAnalysisPath);
  } catch {
    const stub: JobAnalysis = {
      schemaVersion: 1,
      generatedAt: nowIso(),
      jobSource: jobRelPath,
      tagsForGraphQL: {
        domains: [],
        stack: [],
        kinds: ["experience", "education", "project"],
        groups: []
      },
      tagsForTokenization: [],
      summaryForGeneration: "TODO: fill summaryForGeneration via the manual prompt."
    };
    await fs.writeFile(jobAnalysisPath, JSON.stringify(stub, null, 2) + "\n", "utf8");
  }

  return { jobAnalysisPath, manualPromptPath, via: "manual" };
}
