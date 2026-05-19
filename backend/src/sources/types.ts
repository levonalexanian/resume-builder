import { z } from "zod";

export const SourceDocSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  kind: z.enum(["experience", "education", "project", "other"]),
  group: z.string().min(1),
  groupKey: z.string().min(1),
  title: z.string().min(1),
  meta: z.record(z.string(), z.string()).default({}),
  tags: z.array(z.string()).default([]),
  bullets: z.array(z.string()).default([]),
  text: z.string().min(0)
});

export type SourceDoc = z.infer<typeof SourceDocSchema>;

export const SourcesIndexSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().min(1),
  docs: z.array(SourceDocSchema)
});

export type SourcesIndex = z.infer<typeof SourcesIndexSchema>;

export const SelectedBulletSchema = z.object({
  text: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  score: z.number()
});

export const SelectedExperienceSchema = z.object({
  company: z.string().min(1),
  role: z.string().optional(),
  location: z.string().optional(),
  duration: z.string().optional(),
  bullets: z.array(SelectedBulletSchema).default([]),
  evidence: z.array(z.string().min(1)).default([])
});

export const SelectedEducationSchema = z.object({
  school: z.string().min(1),
  diploma: z.string().optional(),
  location: z.string().optional(),
  duration: z.string().optional(),
  gpa: z.string().optional(),
  bullets: z.array(SelectedBulletSchema).default([]),
  evidence: z.array(z.string().min(1)).default([])
});

export const SelectedSourcesSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().min(1),
  job: z.object({
    path: z.string().min(1),
    company: z.string().optional(),
    focus: z.string().optional()
  }),
  experience: z.array(SelectedExperienceSchema).default([]),
  education: z.array(SelectedEducationSchema).default([]),
  projects: z.array(z.any()).default([])
});

export type SelectedSources = z.infer<typeof SelectedSourcesSchema>;
