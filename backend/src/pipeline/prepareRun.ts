import fs from "node:fs/promises";
import path from "node:path";
import Mustache from "mustache";
import { indexSources } from "../sources/indexSources.js";
import { selectSources } from "../sources/selectSources.js";
import type { SourceDoc } from "../sources/types.js";
import { readResumeConfigText } from "../resumeConfig/readResumeConfigText.js";
import { safeBasename } from "../util/textUtil.js";
import { nowRunId } from "../util/timeUtil.js";
import { ensureDir } from "../util/fsUtil.js";

export type PrepareRunInput = {
  root: string;
  job: string;
  outDir: string;
  company?: string;
  focus?: string;
  template: string;
  config: string;
  maxExperiences: number;
  maxBulletsPerExperience: number;
};

export type PrepareRunResult = {
  runDir: string;
  promptPath: string;
  contextDir: string;
  selectedSourcesPath: string;
  jobCopyPath: string;
  templateCopyPath?: string;
  configCopyPath?: string;
};

async function copyFileIfExists(src: string, dest: string): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    return true;
  } catch {
    return false;
  }
}

async function readGeneratePromptTemplate(repoRoot: string): Promise<string | null> {
  const candidate = path.join(repoRoot, "templates", "generate.prompt.md");
  try {
    return await fs.readFile(candidate, "utf8");
  } catch {
    return null;
  }
}

export async function prepareRun(input: PrepareRunInput): Promise<PrepareRunResult> {
  const runSlug = `${nowRunId()}_${safeBasename(input.company ?? "run")}${input.focus ? `_${safeBasename(input.focus)}` : ""}`;
  const runDir = path.join(input.outDir, runSlug);
  const contextDir = path.join(runDir, "context");
  const inputsDir = path.join(runDir, "inputs");

  await ensureDir(contextDir);
  await ensureDir(inputsDir);

  const jobText = await fs.readFile(input.job, "utf8");
  const jobCopyPath = path.join(inputsDir, path.basename(input.job));
  await fs.writeFile(jobCopyPath, jobText, "utf8");

  const sourcesIndex = await indexSources({ root: input.root });
  const selection = selectSources({
    jobText,
    jobPath: path.relative(input.root, input.job),
    sourcesIndex,
    companyOverride: input.company,
    focusOverride: input.focus,
    maxExperiences: input.maxExperiences,
    maxBulletsPerExperience: input.maxBulletsPerExperience
  });

  const selectedSourcesPath = path.join(inputsDir, "selected_sources.json");
  await fs.writeFile(selectedSourcesPath, JSON.stringify(selection, null, 2) + "\n", "utf8");

  const evidencePaths = new Set<string>();
  for (const e of selection.experience) for (const p of e.evidence) evidencePaths.add(p);
  for (const e of selection.education) for (const p of e.evidence) evidencePaths.add(p);

  const selectedDocs: SourceDoc[] = sourcesIndex.docs.filter((d) => evidencePaths.has(d.path));

  for (const rel of evidencePaths) {
    const abs = path.join(input.root, rel);
    const dest = path.join(contextDir, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fs.copyFile(abs, dest);
    } catch {
      // Source might be transient; do not fail prepare.
    }
  }

  const templateCopyPath = (await copyFileIfExists(input.template, path.join(inputsDir, "template.tex")))
    ? path.join(inputsDir, "template.tex")
    : undefined;

  const configText = await readResumeConfigText(input.config);
  const configCopyPath = configText
    ? (await copyFileIfExists(input.config, path.join(inputsDir, "resume.config.json")))
      ? path.join(inputsDir, "resume.config.json")
      : undefined
    : undefined;

  const promptPath = path.join(runDir, "resume.prompt.md");
  const promptTemplate = await readGeneratePromptTemplate(input.root);
  const prompt = renderResumePrompt({
    repoRoot: input.root,
    runDir,
    contextDir,
    jobCopyPath,
    selectedDocs,
    configIncluded: Boolean(configCopyPath),
    templateIncluded: Boolean(templateCopyPath),
    promptTemplate
  });
  await fs.writeFile(promptPath, prompt, "utf8");

  return {
    runDir,
    promptPath,
    contextDir,
    selectedSourcesPath,
    jobCopyPath,
    templateCopyPath,
    configCopyPath
  };
}

function formatSourceList(docs: SourceDoc[]): string {
  return docs
    .map((d) => `- ${path.posix.normalize(d.path)}${d.title ? ` — ${d.title}` : ""}`)
    .join("\n");
}

function renderResumePrompt(args: {
  repoRoot: string;
  runDir: string;
  contextDir: string;
  jobCopyPath: string;
  selectedDocs: SourceDoc[];
  configIncluded: boolean;
  templateIncluded: boolean;
  promptTemplate: string | null;
}): string {
  const toPosix = (p: string): string => path.relative(args.repoRoot, p).split(path.sep).join(path.posix.sep);
  const view = {
    JOB_PATH: toPosix(args.jobCopyPath),
    CONTEXT_DIR: toPosix(args.contextDir) + "/",
    RUN_DIR: toPosix(args.runDir),
    SOURCE_LIST: formatSourceList(args.selectedDocs),
    HAS_CONFIG: args.configIncluded,
    HAS_TEMPLATE: args.templateIncluded
  };

  if (args.promptTemplate) {
    return Mustache.render(args.promptTemplate, view, undefined, { escape: (v) => String(v) });
  }

  return [
    "# Resume authoring prompt",
    "",
    `Job description (copied): ${view.JOB_PATH}`,
    `Context files: ${view.CONTEXT_DIR}`,
    "",
    "## Selected sources",
    view.SOURCE_LIST,
    "",
    "## Task",
    "1. Read the job description and context files.",
    `2. Produce \`${view.RUN_DIR}/resume.tex\` using the template and config in \`inputs/\`.`,
    `3. Compile with \`./scripts/latex_to_pdf ${view.RUN_DIR}/resume.tex ${view.RUN_DIR}/resume.pdf\`.`,
    "",
    "## Constraints",
    "- Every claim must be supported by a context file.",
    "- Prefer the user's existing tone and voice.",
    "- Keep the resume to one page."
  ].join("\n");
}
