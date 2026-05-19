import { z } from "zod";

/**
 * Shape produced by Step 1 (Perplexity or manual).
 */
export const TagsForGraphQLSchema = z.object({
  company: z.string().min(1).optional(),
  roleFamily: z.string().min(1).optional(),
  seniority: z.string().min(1).optional(),
  domains: z.array(z.string().min(1)).default([]),
  stack: z.array(z.string().min(1)).default([]),
  kinds: z.array(z.enum(["experience", "education", "project"])).default(["experience", "education", "project"]),
  groups: z.array(z.string().min(1)).default([])
});

export type TagsForGraphQL = z.infer<typeof TagsForGraphQLSchema>;

export const JobAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().min(1),
  jobSource: z.string().min(1),
  tagsForGraphQL: TagsForGraphQLSchema,
  tagsForTokenization: z.array(z.string().min(1)).default([]),
  summaryForGeneration: z.string().min(1),
  rawProviderResponse: z.string().optional()
});

export type JobAnalysis = z.infer<typeof JobAnalysisSchema>;
