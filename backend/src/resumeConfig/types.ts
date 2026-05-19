import { z } from "zod";

export const ResumeConfigSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().min(1),
  linkedinUrl: z.string().min(1),
  linkedinDisplay: z.string().optional(),
  githubUrl: z.string().min(1),
  githubDisplay: z.string().optional(),
  skillsLatex: z.string().optional()
});

export type ResumeConfig = z.infer<typeof ResumeConfigSchema>;
