#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { analyzeStep } from "./steps/analyze.js";
import { retrieveStep } from "./steps/retrieve.js";
import { rankStep } from "./steps/rank.js";
import { draftStep } from "./steps/draft.js";
import { pdfStep } from "./steps/pdf.js";
import { runPipeline } from "./pipeline/runPipeline.js";
import { prepareRun } from "./pipeline/prepareRun.js";

const program = new Command();

async function inferRepoRoot(startDir: string): Promise<string> {
  let current = path.resolve(startDir);
  for (let i = 0; i < 10; i += 1) {
    try {
      await fs.access(path.join(current, "scripts", "latex_to_pdf"));
      return current;
    } catch {
      // keep walking
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(startDir);
}

function resolveFrom(base: string, maybePath: string): string {
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(base, maybePath);
}

async function resolveCommonPaths(opts: {
  root?: string;
  outDir?: string;
  template?: string;
  config?: string;
}): Promise<{
  repoRoot: string;
  outDir: string;
  templatePath: string;
  configPath: string;
}> {
  const repoRoot = opts.root ? path.resolve(process.cwd(), opts.root) : await inferRepoRoot(process.cwd());
  const outDir = resolveFrom(repoRoot, opts.outDir ?? "resumes");
  const templatePath = resolveFrom(repoRoot, opts.template ?? path.join("templates", "resume_template.tex"));
  const configPath = resolveFrom(repoRoot, opts.config ?? "resume.config.json");
  return { repoRoot, outDir, templatePath, configPath };
}

function printJson(value: unknown): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(value, null, 2));
}

program
  .name("resume-orchestrator")
  .description("Generate a tailored LaTeX/PDF resume from markdown sources + a job description")
  .version("0.2.0");

program
  .command("analyze")
  .description("Step 1: produce inputs/job_analysis.json (Perplexity if enabled, manual stub otherwise).")
  .requiredOption("--job <path>", "Path to job description (md/txt)")
  .option("--run <dir>", "Existing run directory (defaults to a new resumes/<slug>/)")
  .option("--root <path>", "Repo root (auto-detected if omitted)")
  .option("--outDir <path>", "Output directory root", "resumes")
  .option("--company <name>", "Company slug override")
  .option("--focus <name>", "Focus slug override")
  .action(async (opts: { job: string; run?: string; root?: string; outDir?: string; company?: string; focus?: string }) => {
    const { repoRoot, outDir } = await resolveCommonPaths(opts);
    const jobPath = path.resolve(process.cwd(), opts.job);
    const runDir = opts.run
      ? path.resolve(process.cwd(), opts.run)
      : path.join(outDir, `${Date.now()}_${(opts.company ?? "run")}${opts.focus ? `_${opts.focus}` : ""}`);
    const result = await analyzeStep({ repoRoot, jobPath, runDir });
    printJson({ runDir, ...result });
  });

program
  .command("retrieve")
  .description("Step 2: run GraphQL retrieval over the markdown index and write inputs/retrieval_candidates.json.")
  .requiredOption("--run <dir>", "Run directory containing inputs/job_analysis.json")
  .option("--root <path>", "Repo root (auto-detected if omitted)")
  .action(async (opts: { run: string; root?: string }) => {
    const { repoRoot } = await resolveCommonPaths(opts);
    const runDir = path.resolve(process.cwd(), opts.run);
    const result = await retrieveStep({ repoRoot, runDir });
    printJson({ runDir, ...result });
  });

program
  .command("rank")
  .description("Step 3: combine relevancy + freshness; write inputs/ranked_sources.json.")
  .requiredOption("--run <dir>", "Run directory containing inputs/job_analysis.json and inputs/retrieval_candidates.json")
  .requiredOption("--job <path>", "Path to job description (used as raw text input)")
  .option("--root <path>", "Repo root (auto-detected if omitted)")
  .option("--relevancyWeight <n>", "Weight for relevancy in combined score", "0.75")
  .option("--freshnessWeight <n>", "Weight for freshness in combined score", "0.25")
  .action(async (opts: { run: string; job: string; root?: string; relevancyWeight?: string; freshnessWeight?: string }) => {
    const { repoRoot } = await resolveCommonPaths(opts);
    const runDir = path.resolve(process.cwd(), opts.run);
    const jobPath = path.resolve(process.cwd(), opts.job);
    const relevancy = Number(opts.relevancyWeight ?? "0.75");
    const freshness = Number(opts.freshnessWeight ?? "0.25");
    const result = await rankStep({
      repoRoot,
      runDir,
      jobPath,
      weights: { relevancy, freshness }
    });
    printJson({ runDir, ...result });
  });

program
  .command("draft")
  .description("Step 4: write resume.tex (deterministic by default; LLM when RESUME_USE_LLM_DRAFT=true).")
  .requiredOption("--run <dir>", "Run directory containing inputs/ranked_sources.json")
  .requiredOption("--job <path>", "Path to job description (used for context)")
  .option("--root <path>", "Repo root (auto-detected if omitted)")
  .option("--template <path>", "LaTeX template path")
  .option("--config <path>", "Resume config JSON path")
  .option("--maxExperiences <n>", "Max experiences", "2")
  .option("--maxBulletsPerExperience <n>", "Max bullets per experience", "4")
  .option("--pdf", "Also compile resume.pdf after writing resume.tex", false)
  .action(
    async (opts: {
      run: string;
      job: string;
      root?: string;
      template?: string;
      config?: string;
      maxExperiences?: string;
      maxBulletsPerExperience?: string;
      pdf?: boolean;
    }) => {
      const { repoRoot, templatePath, configPath } = await resolveCommonPaths(opts);
      const runDir = path.resolve(process.cwd(), opts.run);
      const jobPath = path.resolve(process.cwd(), opts.job);
      const draft = await draftStep({
        repoRoot,
        runDir,
        jobPath,
        templatePath,
        configPath,
        maxExperiences: Number(opts.maxExperiences ?? "2"),
        maxBulletsPerExperience: Number(opts.maxBulletsPerExperience ?? "4")
      });
      let pdf: { resumePdfPath: string; buildLogPath: string } | undefined;
      if (opts.pdf) pdf = await pdfStep({ repoRoot, runDir });
      printJson({ runDir, ...draft, ...(pdf ?? {}) });
    }
  );

program
  .command("pdf")
  .description("Compile resume.tex to resume.pdf using scripts/latex_to_pdf.")
  .requiredOption("--run <dir>", "Run directory containing resume.tex")
  .option("--root <path>", "Repo root (auto-detected if omitted)")
  .action(async (opts: { run: string; root?: string }) => {
    const { repoRoot } = await resolveCommonPaths(opts);
    const runDir = path.resolve(process.cwd(), opts.run);
    const result = await pdfStep({ repoRoot, runDir });
    printJson({ runDir, ...result });
  });

program
  .command("run")
  .description("Chain Steps 1–4 and compile a PDF. Honors .env toggles for Perplexity / LLM draft.")
  .requiredOption("--job <path>", "Path to job description (md/txt)")
  .option("--root <path>", "Repo root (auto-detected if omitted)")
  .option("--outDir <path>", "Output directory root", "resumes")
  .option("--company <name>", "Company override (for the run slug)")
  .option("--focus <name>", "Focus override (for the run slug)")
  .option("--template <path>", "LaTeX template path")
  .option("--config <path>", "Resume config JSON path")
  .option("--maxExperiences <n>", "Max experiences", "2")
  .option("--maxBulletsPerExperience <n>", "Max bullets per experience", "4")
  .option("--no-pdf", "Skip PDF compile")
  .action(
    async (opts: {
      job: string;
      root?: string;
      outDir?: string;
      company?: string;
      focus?: string;
      template?: string;
      config?: string;
      maxExperiences?: string;
      maxBulletsPerExperience?: string;
      pdf?: boolean;
    }) => {
      const { repoRoot, outDir, templatePath, configPath } = await resolveCommonPaths(opts);
      const jobPath = path.resolve(process.cwd(), opts.job);
      const result = await runPipeline({
        repoRoot,
        jobPath,
        outDir,
        configPath,
        templatePath,
        company: opts.company,
        focus: opts.focus,
        buildPdf: opts.pdf !== false,
        maxExperiences: Number(opts.maxExperiences ?? "2"),
        maxBulletsPerExperience: Number(opts.maxBulletsPerExperience ?? "4")
      });
      printJson(result);
    }
  );

program
  .command("generate")
  .description("Deterministic full pipeline: like `run`, but never invokes the LLM draft.")
  .requiredOption("--job <path>", "Path to job description (md/txt)")
  .option("--root <path>", "Repo root (auto-detected if omitted)")
  .option("--outDir <path>", "Output directory root", "resumes")
  .option("--company <name>", "Company override (for the run slug)")
  .option("--focus <name>", "Focus override (for the run slug)")
  .option("--template <path>", "LaTeX template path")
  .option("--config <path>", "Resume config JSON path")
  .option("--maxExperiences <n>", "Max experiences", "2")
  .option("--maxBulletsPerExperience <n>", "Max bullets per experience", "4")
  .option("--no-pdf", "Skip PDF compile")
  .action(
    async (opts: {
      job: string;
      root?: string;
      outDir?: string;
      company?: string;
      focus?: string;
      template?: string;
      config?: string;
      maxExperiences?: string;
      maxBulletsPerExperience?: string;
      pdf?: boolean;
    }) => {
      const { repoRoot, outDir, templatePath, configPath } = await resolveCommonPaths(opts);
      process.env.RESUME_USE_LLM_DRAFT = "false";
      const jobPath = path.resolve(process.cwd(), opts.job);
      const result = await runPipeline({
        repoRoot,
        jobPath,
        outDir,
        configPath,
        templatePath,
        company: opts.company,
        focus: opts.focus,
        buildPdf: opts.pdf !== false,
        maxExperiences: Number(opts.maxExperiences ?? "2"),
        maxBulletsPerExperience: Number(opts.maxBulletsPerExperience ?? "4")
      });
      printJson(result);
    }
  );

program
  .command("prepare")
  .description("Legacy file-only prep: index → select → write context pack + resume.prompt.md (no LLM, no PDF).")
  .requiredOption("--job <path>", "Path to job description (md/txt)")
  .option("--root <path>", "Repo root (auto-detected if omitted)")
  .option("--outDir <path>", "Output directory root (relative to repo root)", "resumes")
  .option("--company <name>", "Company name (otherwise inferred)")
  .option("--focus <name>", "Focus area (fullstack|firmware|embedded|ai)")
  .option("--template <path>", "LaTeX template path")
  .option("--config <path>", "Resume config JSON path")
  .option("--maxExperiences <n>", "Max experience entries", "2")
  .option("--maxBulletsPerExperience <n>", "Max bullets per experience", "4")
  .action(
    async (opts: {
      job: string;
      root?: string;
      outDir?: string;
      company?: string;
      focus?: string;
      template?: string;
      config?: string;
      maxExperiences?: string;
      maxBulletsPerExperience?: string;
    }) => {
      const { repoRoot, outDir, templatePath, configPath } = await resolveCommonPaths(opts);
      const jobPath = path.resolve(process.cwd(), opts.job);
      const result = await prepareRun({
        root: repoRoot,
        job: jobPath,
        outDir,
        company: opts.company,
        focus: opts.focus,
        template: templatePath,
        config: configPath,
        maxExperiences: Number(opts.maxExperiences ?? "2"),
        maxBulletsPerExperience: Number(opts.maxBulletsPerExperience ?? "4")
      });
      printJson(result);
    }
  );

await program.parseAsync(process.argv);
