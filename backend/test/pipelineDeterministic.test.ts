import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { analyzeStep } from "../src/steps/analyze.js";
import { retrieveStep } from "../src/steps/retrieve.js";
import { rankStep } from "../src/steps/rank.js";
import { draftStep } from "../src/steps/draft.js";
import { JobAnalysisSchema } from "../src/schemas/jobAnalysis.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

let runDir: string;
let jobPath: string;

beforeAll(async () => {
  runDir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-run-"));
  jobPath = path.join(runDir, "job.md");
  await fs.writeFile(
    jobPath,
    [
      "Company: Talk To Medi",
      "",
      "We are hiring a Full Stack Developer.",
      "Must be comfortable with TypeScript, React, GraphQL, and SQL.",
      "Bonus: Prisma, AWS, and embedded experience."
    ].join("\n"),
    "utf8"
  );
});

afterAll(async () => {
  await fs.rm(runDir, { recursive: true, force: true });
});

describe("deterministic pipeline (analyze→retrieve→rank→draft)", () => {
  test("writes well-formed artifacts end to end", async () => {
    // Force toggles off so the test does not need the network.
    process.env.RESUME_USE_PERPLEXITY_RESEARCH = "false";
    process.env.RESUME_USE_LLM_DRAFT = "false";

    const analyze = await analyzeStep({ repoRoot, jobPath, runDir });
    expect(analyze.via).toBe("manual");

    // Replace the stub job_analysis.json with realistic tags so retrieve/rank
    // exercise the real filters.
    const analysisPath = analyze.jobAnalysisPath;
    const stub = JSON.parse(await fs.readFile(analysisPath, "utf8"));
    const filled = JobAnalysisSchema.parse({
      ...stub,
      tagsForGraphQL: {
        company: "Talk To Medi",
        roleFamily: "fullstack",
        domains: ["health"],
        stack: ["typescript", "react", "graphql", "sql"],
        kinds: ["experience", "education", "project"],
        groups: []
      },
      tagsForTokenization: ["typescript", "react", "graphql", "prisma", "aws"],
      summaryForGeneration: "Fullstack developer role centered on TS/React/GraphQL."
    });
    await fs.writeFile(analysisPath, JSON.stringify(filled, null, 2) + "\n", "utf8");

    const retrieve = await retrieveStep({ repoRoot, runDir });
    expect(retrieve.candidateCount).toBeGreaterThan(0);

    const rank = await rankStep({ repoRoot, runDir, jobPath });
    const ranked = JSON.parse(await fs.readFile(rank.rankedSourcesPath, "utf8"));
    expect(ranked.weights.relevancy + ranked.weights.freshness).toBeCloseTo(1, 6);
    expect(Array.isArray(ranked.experience)).toBe(true);
    if (ranked.experience.length > 0) {
      const first = ranked.experience[0];
      expect(first.relevancy).toBeGreaterThanOrEqual(0);
      expect(first.relevancy).toBeLessThanOrEqual(1);
      expect(first.freshness).toBeGreaterThanOrEqual(0);
      expect(first.freshness).toBeLessThanOrEqual(1);
      expect(first.score).toBeGreaterThanOrEqual(0);
    }

    const draft = await draftStep({
      repoRoot,
      runDir,
      jobPath,
      templatePath: path.join(repoRoot, "templates", "resume_template.tex"),
      configPath: path.join(repoRoot, "resume.config.json"),
      maxExperiences: 2,
      maxBulletsPerExperience: 4
    });
    expect(draft.via).toBe("deterministic");

    const tex = await fs.readFile(draft.resumeTexPath, "utf8");
    expect(tex).toMatch(/\\documentclass/);
    expect(tex).toMatch(/\\section\{Experience\}/);
    expect(tex).toMatch(/\\section\{Education\}/);
  }, 30_000);
});
