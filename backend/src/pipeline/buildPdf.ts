import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export type BuildPdfOpts = {
  texPath: string;
  pdfPath?: string;
  logPath?: string;
  repoRoot?: string;
};

function runCommand(command: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function buildPdf(opts: BuildPdfOpts): Promise<void> {
  const texAbs = path.resolve(opts.texPath);
  const pdfAbs = path.resolve(opts.pdfPath ?? texAbs.replace(/\.tex$/i, ".pdf"));
  const logAbs = opts.logPath ? path.resolve(opts.logPath) : undefined;

  const repoRoot = opts.repoRoot ? path.resolve(opts.repoRoot) : await findRepoRoot(process.cwd());
  const scriptPath = path.join(repoRoot, "scripts", "latex_to_pdf");

  const cwd = repoRoot;
  const args = [scriptPath, texAbs, pdfAbs];

  const { code, stdout, stderr } = await runCommand("bash", args, cwd);
  const log = [
    `command: bash ${args.map((a) => JSON.stringify(a)).join(" ")}`,
    `exit_code: ${code}`,
    "--- stdout ---",
    stdout.trimEnd(),
    "--- stderr ---",
    stderr.trimEnd(),
    ""
  ].join("\n");

  if (logAbs) {
    await fs.writeFile(logAbs, log, "utf8");
  }

  if (code !== 0) {
    throw new Error(`latex build failed (exit ${code}). See ${logAbs ?? "stderr"}.`);
  }
}

async function findRepoRoot(startDir: string): Promise<string> {
  let current = path.resolve(startDir);
  for (let i = 0; i < 10; i += 1) {
    const candidate = path.join(current, "scripts", "latex_to_pdf");
    try {
      await fs.access(candidate);
      return current;
    } catch {
      // keep walking
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(startDir);
}
