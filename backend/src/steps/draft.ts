import fs from "node:fs/promises";
import path from "node:path";
import Mustache from "mustache";
import { JobAnalysis, JobAnalysisSchema } from "../schemas/jobAnalysis.js";
import { RankedSources, RankedSourcesSchema } from "../schemas/rankedSources.js";
import { SelectedSources, SelectedSourcesSchema } from "../sources/types.js";
import { renderLatex } from "../tex/renderLatex.js";
import { loadResumeConfig } from "../resumeConfig/loadResumeConfig.js";
import { ensureDir } from "../util/fsUtil.js";
import { loadResumeEnv, MissingApiKeyError, ResumeEnv } from "../util/env.js";
import { extractLatexDocument, resolveDraftProvider } from "../clients/llmDraft.js";
import { nowIso } from "../util/timeUtil.js";

export type DraftStepOpts = {
  repoRoot: string;
  runDir: string;
  jobPath: string;
  configPath: string;
  templatePath: string;
  maxExperiences?: number;
  maxBulletsPerExperience?: number;
  env?: ResumeEnv;
};

export type DraftStepResult = {
  resumeTexPath: string;
  via: "deterministic" | "llm";
  provider?: "openai" | "anthropic" | "google";
};

function rankedToSelected(ranked: RankedSources, max: number, maxBullets: number): SelectedSources {
  const experience = ranked.experience.slice(0, max).map((e) => ({
    company: e.title,
    role: e.role,
    location: e.location,
    duration: e.duration,
    bullets: e.bullets.slice(0, maxBullets).map((b) => ({
      text: b.text,
      evidence: b.evidence,
      score: b.score
    })),
    evidence: e.evidence
  }));
  const education = ranked.education.map((e) => ({
    school: e.title,
    diploma: e.diploma,
    location: e.location,
    duration: e.duration,
    gpa: e.gpa,
    bullets: [],
    evidence: e.evidence
  }));
  return SelectedSourcesSchema.parse({
    schemaVersion: 1,
    generatedAt: nowIso(),
    job: ranked.job,
    experience,
    education,
    projects: ranked.projects.slice(0, max).map((p) => ({
      title: p.title,
      duration: p.duration,
      evidence: p.evidence,
      bullets: p.bullets.map((b) => ({ text: b.text, evidence: b.evidence, score: b.score }))
    }))
  });
}

export async function draftStep(opts: DraftStepOpts): Promise<DraftStepResult> {
  const inputsDir = path.join(opts.runDir, "inputs");
  await ensureDir(opts.runDir);
  await ensureDir(inputsDir);

  const env = opts.env ?? (await loadResumeEnv(opts.repoRoot));

  const rankedPath = path.join(inputsDir, "ranked_sources.json");
  const analysisPath = path.join(inputsDir, "job_analysis.json");
  const ranked = RankedSourcesSchema.parse(JSON.parse(await fs.readFile(rankedPath, "utf8")));
  const analysis: JobAnalysis = JobAnalysisSchema.parse(JSON.parse(await fs.readFile(analysisPath, "utf8")));

  const templateText = await fs.readFile(opts.templatePath, "utf8");
  const resumeConfig = await loadResumeConfig(opts.configPath);
  const selection = rankedToSelected(
    ranked,
    opts.maxExperiences ?? 2,
    opts.maxBulletsPerExperience ?? 4
  );

  // Always copy template + analysis/ranked into inputs/ for audit (idempotent).
  await fs.copyFile(opts.templatePath, path.join(inputsDir, "template.tex"));
  await fs.copyFile(opts.configPath, path.join(inputsDir, "resume.config.json"));
  await fs.copyFile(opts.jobPath, path.join(inputsDir, path.basename(opts.jobPath)));

  const resumeTexPath = path.join(opts.runDir, "resume.tex");

  if (env.RESUME_USE_LLM_DRAFT) {
    if (!env.RESUME_DRAFT_PROVIDER && !(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY)) {
      throw new MissingApiKeyError("RESUME_USE_LLM_DRAFT", "OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY");
    }
    const { provider, client } = resolveDraftProvider(env);
    const promptTemplate = await fs.readFile(
      path.join(opts.repoRoot, "templates", "generate.prompt.md"),
      "utf8"
    );
    const promptView = {
      JOB_PATH: path.relative(opts.repoRoot, opts.jobPath),
      CONTEXT_DIR: path.relative(opts.repoRoot, path.join(opts.runDir, "context")) + "/",
      RUN_DIR: path.relative(opts.repoRoot, opts.runDir),
      SOURCE_LIST: ranked.experience
        .concat(ranked.education)
        .concat(ranked.projects)
        .map((e) => `- ${e.evidence[0] ?? e.id} — ${e.title}`)
        .join("\n")
    };
    const userPrompt = [
      Mustache.render(promptTemplate, promptView, undefined, { escape: (v) => String(v) }),
      "",
      "## Inputs (verbatim JSON)",
      "",
      "### job_analysis.json",
      "```json",
      JSON.stringify(analysis, null, 2),
      "```",
      "",
      "### ranked_sources.json",
      "```json",
      JSON.stringify(ranked, null, 2),
      "```",
      "",
      "### template.tex (Mustache delimiters << >>)",
      "```latex",
      templateText,
      "```",
      "",
      "### resume.config.json",
      "```json",
      JSON.stringify(resumeConfig, null, 2),
      "```",
      "",
      "Output the COMPLETE resume.tex (no fences, no commentary)."
    ].join("\n");

    const raw = await client({
      system:
        "You are a careful resume engineer. Fill the LaTeX template using only " +
        "facts present in ranked_sources.json and the source files referenced by " +
        "evidence paths. Output the full .tex document.",
      user: userPrompt
    });

    const latex = extractLatexDocument(raw);
    await fs.writeFile(resumeTexPath, latex, "utf8");
    return { resumeTexPath, via: "llm", provider };
  }

  const { latex } = renderLatex({
    templateText,
    resumeConfig,
    selection,
    repoRoot: opts.repoRoot
  });

  await fs.writeFile(resumeTexPath, latex, "utf8");

  return { resumeTexPath, via: "deterministic" };
}
