import path from "node:path";
import { buildPdf } from "../pipeline/buildPdf.js";
import { ensureDir } from "../util/fsUtil.js";

export type PdfStepOpts = {
  repoRoot: string;
  runDir: string;
};

export type PdfStepResult = {
  resumePdfPath: string;
  buildLogPath: string;
};

export async function pdfStep(opts: PdfStepOpts): Promise<PdfStepResult> {
  await ensureDir(opts.runDir);
  const texPath = path.join(opts.runDir, "resume.tex");
  const pdfPath = path.join(opts.runDir, "resume.pdf");
  const logPath = path.join(opts.runDir, "build.log");
  await buildPdf({ texPath, pdfPath, logPath, repoRoot: opts.repoRoot });
  return { resumePdfPath: pdfPath, buildLogPath: logPath };
}
