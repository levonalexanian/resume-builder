import fs from "node:fs/promises";
import path from "node:path";

export type ResumeEnv = {
  PERPLEXITY_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  RESUME_USE_PERPLEXITY_RESEARCH: boolean;
  RESUME_USE_LLM_RERANK: boolean;
  RESUME_USE_LLM_DRAFT: boolean;
  RESUME_DRAFT_PROVIDER?: "openai" | "anthropic" | "google";
};

const TRUTHY = new Set(["1", "true", "yes", "on"]);

export function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return TRUTHY.has(value.trim().toLowerCase());
}

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export async function loadDotEnvFromRoot(repoRoot: string): Promise<Record<string, string>> {
  const candidate = path.join(repoRoot, ".env");
  try {
    const text = await fs.readFile(candidate, "utf8");
    return parseDotEnv(text);
  } catch {
    return {};
  }
}

export async function loadResumeEnv(repoRoot: string): Promise<ResumeEnv> {
  const file = await loadDotEnvFromRoot(repoRoot);
  const get = (key: string): string | undefined => process.env[key] ?? file[key] ?? undefined;
  const provider = (get("RESUME_DRAFT_PROVIDER") ?? "").trim().toLowerCase();
  const allowedProviders = new Set(["openai", "anthropic", "google"]);
  return {
    PERPLEXITY_API_KEY: get("PERPLEXITY_API_KEY"),
    OPENAI_API_KEY: get("OPENAI_API_KEY"),
    ANTHROPIC_API_KEY: get("ANTHROPIC_API_KEY"),
    GOOGLE_GENERATIVE_AI_API_KEY: get("GOOGLE_GENERATIVE_AI_API_KEY"),
    RESUME_USE_PERPLEXITY_RESEARCH: parseBoolean(get("RESUME_USE_PERPLEXITY_RESEARCH")),
    RESUME_USE_LLM_RERANK: parseBoolean(get("RESUME_USE_LLM_RERANK")),
    RESUME_USE_LLM_DRAFT: parseBoolean(get("RESUME_USE_LLM_DRAFT")),
    RESUME_DRAFT_PROVIDER: allowedProviders.has(provider) ? (provider as ResumeEnv["RESUME_DRAFT_PROVIDER"]) : undefined
  };
}

export class MissingApiKeyError extends Error {
  constructor(toggle: string, key: string) {
    super(
      `${toggle} is enabled but ${key} is not set in repo-root .env or environment. ` +
        `Either set the key or disable the toggle.`
    );
    this.name = "MissingApiKeyError";
  }
}
