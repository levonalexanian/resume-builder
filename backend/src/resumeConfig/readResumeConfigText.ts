import fs from "node:fs/promises";

export async function readResumeConfigText(configPath: string): Promise<string | null> {
  try {
    return await fs.readFile(configPath, "utf8");
  } catch {
    return null;
  }
}
