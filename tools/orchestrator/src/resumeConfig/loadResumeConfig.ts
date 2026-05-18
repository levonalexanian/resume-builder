import fs from "node:fs/promises";
import path from "node:path";
import { ResumeConfig, ResumeConfigSchema } from "./types.js";

export async function loadResumeConfig(configPath: string): Promise<ResumeConfig> {
  const abs = path.resolve(configPath);
  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch (err) {
    const hint = `Missing resume config at ${abs}. Create it from resume.config.json.example (repo root): cp resume.config.json.example resume.config.json`;
    throw new Error(hint, { cause: err as Error });
  }
  const json = JSON.parse(raw) as unknown;
  return ResumeConfigSchema.parse(json);
}
