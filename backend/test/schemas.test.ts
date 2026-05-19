import { describe, expect, test } from "vitest";
import { JobAnalysisSchema } from "../src/schemas/jobAnalysis.js";
import { RetrievalCandidatesSchema } from "../src/schemas/retrievalCandidates.js";
import { RankedSourcesSchema } from "../src/schemas/rankedSources.js";

describe("JobAnalysisSchema", () => {
  test("accepts a minimal valid payload", () => {
    const parsed = JobAnalysisSchema.parse({
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      jobSource: "job.md",
      tagsForGraphQL: {
        domains: ["robotics"],
        stack: ["typescript"],
        kinds: ["experience"],
        groups: []
      },
      tagsForTokenization: ["typescript", "robotics"],
      summaryForGeneration: "Robotics-focused full-stack role."
    });
    expect(parsed.summaryForGeneration.length).toBeGreaterThan(0);
  });
  test("rejects bad schemaVersion", () => {
    expect(() =>
      JobAnalysisSchema.parse({
        schemaVersion: 2,
        generatedAt: "x",
        jobSource: "j",
        tagsForGraphQL: { domains: [], stack: [], kinds: [], groups: [] },
        tagsForTokenization: [],
        summaryForGeneration: "x"
      })
    ).toThrow();
  });
});

describe("RetrievalCandidatesSchema", () => {
  test("accepts an empty candidate set", () => {
    const parsed = RetrievalCandidatesSchema.parse({
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      query: { operation: "Retrieve", variables: {} },
      candidates: []
    });
    expect(parsed.candidates).toEqual([]);
  });
});

describe("RankedSourcesSchema", () => {
  test("requires non-negative weights and valid entries", () => {
    const parsed = RankedSourcesSchema.parse({
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      job: { path: "job.md" },
      weights: { relevancy: 0.75, freshness: 0.25 },
      experience: [],
      education: [],
      projects: []
    });
    expect(parsed.weights.relevancy).toBe(0.75);
  });
});
