import { z } from "zod";

export const RetrievalCandidateSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  kind: z.enum(["experience", "education", "project"]),
  group: z.string().min(1),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  matchedFilters: z.array(z.string()).default([])
});

export type RetrievalCandidate = z.infer<typeof RetrievalCandidateSchema>;

export const RetrievalCandidatesSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().min(1),
  query: z.object({
    operation: z.string().min(1),
    variables: z.record(z.string(), z.any()).default({})
  }),
  candidates: z.array(RetrievalCandidateSchema).default([])
});

export type RetrievalCandidates = z.infer<typeof RetrievalCandidatesSchema>;
