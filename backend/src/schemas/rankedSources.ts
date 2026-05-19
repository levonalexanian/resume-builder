import { z } from "zod";

export const RankedBulletSchema = z.object({
  text: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  relevancy: z.number(),
  freshness: z.number(),
  score: z.number()
});

export type RankedBullet = z.infer<typeof RankedBulletSchema>;

export const RankedEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["experience", "education", "project"]),
  group: z.string().min(1),
  title: z.string().min(1),
  role: z.string().optional(),
  location: z.string().optional(),
  duration: z.string().optional(),
  diploma: z.string().optional(),
  gpa: z.string().optional(),
  relevancy: z.number(),
  freshness: z.number(),
  score: z.number(),
  evidence: z.array(z.string().min(1)).default([]),
  bullets: z.array(RankedBulletSchema).default([])
});

export type RankedEntry = z.infer<typeof RankedEntrySchema>;

export const RankedSourcesSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().min(1),
  job: z.object({
    path: z.string().min(1),
    company: z.string().optional(),
    focus: z.string().optional()
  }),
  weights: z.object({
    relevancy: z.number(),
    freshness: z.number()
  }),
  experience: z.array(RankedEntrySchema).default([]),
  education: z.array(RankedEntrySchema).default([]),
  projects: z.array(RankedEntrySchema).default([])
});

export type RankedSources = z.infer<typeof RankedSourcesSchema>;
