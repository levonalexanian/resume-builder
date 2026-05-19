#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createYoga } from "graphql-yoga";
import { indexSources } from "../sources/indexSources.js";
import { schema } from "../graph/schema.js";
import { analyzeStep } from "../steps/analyze.js";
import { retrieveStep } from "../steps/retrieve.js";
import { rankStep } from "../steps/rank.js";
import { draftStep } from "../steps/draft.js";
import { pdfStep } from "../steps/pdf.js";
import { JobAnalysisSchema } from "../schemas/jobAnalysis.js";
import { loadResumeEnv } from "../util/env.js";
import { ensureDir, exists } from "../util/fsUtil.js";
import { safeBasename } from "../util/textUtil.js";
import { nowRunId } from "../util/timeUtil.js";
import { inferCompany, inferFocus } from "../sources/selectSources.js";

type StepName = "analyze" | "retrieve" | "rank" | "draft" | "pdf";
type StepStatus = "pending" | "running" | "completed" | "error";

type PipelineEvent =
  | { type: "step"; step: StepName; status: StepStatus; message?: string }
  | { type: "done"; runId: string }
  | { type: "error"; message: string };

type RunRequestBody = {
  jobDescription?: unknown;
  companyHint?: unknown;
  focusHint?: unknown;
};

const STATIC_MIME: Record<string, string> = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

function resolveRepoRoot(): string {
  return process.env.RESUME_REPO_ROOT
    ? path.resolve(process.env.RESUME_REPO_ROOT)
    : path.resolve(process.cwd());
}

function frontendDistDir(repoRoot: string): string {
  return path.join(repoRoot, "frontend", "dist");
}

function parseRunIdToIso(id: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(id);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:00Z`;
}

function runLabel(id: string): string {
  const parts = id.split("_");
  if (parts.length <= 1) return id;
  return parts.slice(1).join(" · ");
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text.length === 0 ? {} : JSON.parse(text));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text)
  });
  res.end(text);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

async function handleSources(repoRoot: string, res: http.ServerResponse): Promise<void> {
  const index = await indexSources({ root: repoRoot });
  sendJson(res, 200, index.docs);
}

async function handleRuns(repoRoot: string, res: http.ServerResponse): Promise<void> {
  const runsDir = path.join(repoRoot, "resumes");
  if (!(await exists(runsDir))) {
    sendJson(res, 200, []);
    return;
  }
  const entries = await fs.readdir(runsDir, { withFileTypes: true });
  const summaries = entries
    .filter((e) => e.isDirectory())
    .map((e) => ({
      id: e.name,
      createdAt: parseRunIdToIso(e.name) ?? "",
      label: runLabel(e.name)
    }))
    .sort((a, b) => (a.id < b.id ? 1 : -1));
  sendJson(res, 200, summaries);
}

async function handleArtifacts(repoRoot: string, runId: string, res: http.ServerResponse): Promise<void> {
  const runDir = path.join(repoRoot, "resumes", runId);
  if (!(await exists(runDir))) {
    sendError(res, 404, `Run not found: ${runId}`);
    return;
  }

  const readJsonFile = async (rel: string): Promise<unknown | null> => {
    const p = path.join(runDir, rel);
    if (!(await exists(p))) return null;
    try {
      return JSON.parse(await fs.readFile(p, "utf8")) as unknown;
    } catch {
      return null;
    }
  };

  const readTextFile = async (rel: string): Promise<string> => {
    const p = path.join(runDir, rel);
    if (!(await exists(p))) return "";
    return fs.readFile(p, "utf8");
  };

  const [jobAnalysis, retrievalCandidates, rankedSources, latex] = await Promise.all([
    readJsonFile("inputs/job_analysis.json"),
    readJsonFile("inputs/retrieval_candidates.json"),
    readJsonFile("inputs/ranked_sources.json"),
    readTextFile("resume.tex")
  ]);

  sendJson(res, 200, { id: runId, jobAnalysis, retrievalCandidates, rankedSources, latex });
}

async function handlePdf(repoRoot: string, runId: string, res: http.ServerResponse): Promise<void> {
  const pdfPath = path.join(repoRoot, "resumes", runId, "resume.pdf");
  if (!(await exists(pdfPath))) {
    sendError(res, 404, `PDF not found for run: ${runId}`);
    return;
  }
  const stat = await fs.stat(pdfPath);
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Length": stat.size,
    "Content-Disposition": `inline; filename="${runId}.pdf"`
  });
  createReadStream(pdfPath).pipe(res);
}

async function streamingPipeline(
  repoRoot: string,
  jobText: string,
  companyHint: string | undefined,
  focusHint: string | undefined,
  emit: (event: PipelineEvent) => void
): Promise<void> {
  const env = await loadResumeEnv(repoRoot);
  const outDir = path.join(repoRoot, "resumes");
  const templatePath = path.join(repoRoot, "templates", "resume_template.tex");
  const configPath = path.join(repoRoot, "resume.config.json");

  const tmpJobPath = path.join("/tmp", `resume-job-${Date.now()}-${process.pid}.md`);
  await fs.writeFile(tmpJobPath, jobText, "utf8");

  const cleanup = async (): Promise<void> => {
    try {
      await fs.unlink(tmpJobPath);
    } catch {
      // best effort
    }
  };

  try {
    const fallbackCompany = companyHint ?? inferCompany(jobText);
    const fallbackFocus = focusHint ?? inferFocus(jobText);
    const slugBase = safeBasename(fallbackCompany ?? "run");
    const slugTail = fallbackFocus ? `_${safeBasename(fallbackFocus)}` : "";
    const provisionalSlug = `${nowRunId()}_${slugBase}${slugTail}`;
    let runDir = path.join(outDir, provisionalSlug);
    await ensureDir(path.join(runDir, "inputs"));
    await ensureDir(path.join(runDir, "context"));
    await fs.copyFile(tmpJobPath, path.join(runDir, "inputs", path.basename(tmpJobPath)));

    emit({ type: "step", step: "analyze", status: "running" });
    const analyze = await analyzeStep({ repoRoot, jobPath: tmpJobPath, runDir, env });

    if (!companyHint || !focusHint) {
      try {
        const analysis = JobAnalysisSchema.parse(JSON.parse(await fs.readFile(analyze.jobAnalysisPath, "utf8")));
        const inferredCompany = companyHint ?? analysis.tagsForGraphQL.company ?? fallbackCompany;
        const inferredFocus = focusHint ?? analysis.tagsForGraphQL.roleFamily ?? fallbackFocus;
        const newSlugBase = safeBasename(inferredCompany ?? "run");
        const newSlugTail = inferredFocus ? `_${safeBasename(inferredFocus)}` : "";
        const newSlug = `${nowRunId()}_${newSlugBase}${newSlugTail}`;
        if (newSlug !== provisionalSlug) {
          const newRunDir = path.join(outDir, newSlug);
          await ensureDir(newRunDir);
          await fs.rename(runDir, newRunDir);
          runDir = newRunDir;
        }
      } catch {
        // analysis missing — keep provisional dir
      }
    }
    emit({ type: "step", step: "analyze", status: "completed" });

    emit({ type: "step", step: "retrieve", status: "running" });
    await retrieveStep({ repoRoot, runDir });
    emit({ type: "step", step: "retrieve", status: "completed" });

    emit({ type: "step", step: "rank", status: "running" });
    const rank = await rankStep({ repoRoot, runDir, jobPath: tmpJobPath });
    await mirrorContextFiles(repoRoot, rank.rankedSourcesPath, path.join(runDir, "context"));
    emit({ type: "step", step: "rank", status: "completed" });

    emit({ type: "step", step: "draft", status: "running" });
    await draftStep({ repoRoot, runDir, jobPath: tmpJobPath, configPath, templatePath, env });
    emit({ type: "step", step: "draft", status: "completed" });

    emit({ type: "step", step: "pdf", status: "running" });
    await pdfStep({ repoRoot, runDir });
    emit({ type: "step", step: "pdf", status: "completed" });

    emit({ type: "done", runId: path.basename(runDir) });
  } finally {
    await cleanup();
  }
}

async function mirrorContextFiles(repoRoot: string, rankedSourcesPath: string, contextDir: string): Promise<void> {
  const raw = await fs.readFile(rankedSourcesPath, "utf8");
  const ranked = JSON.parse(raw) as {
    experience?: Array<{ evidence?: string[] }>;
    education?: Array<{ evidence?: string[] }>;
    projects?: Array<{ evidence?: string[] }>;
  };
  const paths = new Set<string>();
  for (const list of [ranked.experience ?? [], ranked.education ?? [], ranked.projects ?? []]) {
    for (const entry of list) for (const p of entry.evidence ?? []) paths.add(p);
  }
  await ensureDir(contextDir);
  for (const rel of paths) {
    const abs = path.join(repoRoot, rel);
    const dest = path.join(contextDir, rel);
    try {
      await ensureDir(path.dirname(dest));
      await fs.copyFile(abs, dest);
    } catch {
      // skip missing files
    }
  }
}

async function handleRun(repoRoot: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: RunRequestBody;
  try {
    body = (await readJson(req)) as RunRequestBody;
  } catch {
    sendError(res, 400, "Invalid JSON body");
    return;
  }
  const jobDescription = typeof body.jobDescription === "string" ? body.jobDescription : "";
  const companyHint = typeof body.companyHint === "string" && body.companyHint.length > 0 ? body.companyHint : undefined;
  const focusHint = typeof body.focusHint === "string" && body.focusHint.length > 0 ? body.focusHint : undefined;
  if (jobDescription.trim().length === 0) {
    sendError(res, 400, "jobDescription is required");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const emit = (event: PipelineEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await streamingPipeline(repoRoot, jobDescription, companyHint, focusHint, emit);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ type: "error", message });
  } finally {
    res.end();
  }
}

async function serveStatic(repoRoot: string, pathname: string, res: http.ServerResponse): Promise<void> {
  const dist = frontendDistDir(repoRoot);
  const indexPath = path.join(dist, "index.html");

  const ext = path.extname(pathname).toLowerCase();
  if (ext && STATIC_MIME[ext]) {
    const safeRel = pathname.replace(/^\/+/, "").split("/").filter((seg) => seg !== "..").join("/");
    const filePath = path.join(dist, safeRel);
    if (filePath.startsWith(dist) && (await exists(filePath))) {
      const stat = await fs.stat(filePath);
      res.writeHead(200, {
        "Content-Type": STATIC_MIME[ext] ?? "application/octet-stream",
        "Content-Length": stat.size
      });
      createReadStream(filePath).pipe(res);
      return;
    }
  }

  if (await exists(indexPath)) {
    const stat = await fs.stat(indexPath);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache"
    });
    createReadStream(indexPath).pipe(res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(`Frontend build not found at ${dist}. Run \`make frontend-build\` first.`);
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const port = Number(process.env.PORT ?? "3001");

  const yoga = createYoga({
    schema,
    graphqlEndpoint: "/graphql",
    context: async () => ({ index: await indexSources({ root: repoRoot }) })
  });

  const server = http.createServer((req, res) => {
    (async (): Promise<void> => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const pathname = url.pathname;
      const method = req.method ?? "GET";

      if (pathname === "/graphql" || pathname.startsWith("/graphql/")) {
        return yoga(req, res);
      }

      if (pathname === "/api/sources" && method === "GET") {
        return handleSources(repoRoot, res);
      }
      if (pathname === "/api/runs" && method === "GET") {
        return handleRuns(repoRoot, res);
      }
      if (pathname === "/api/run" && method === "POST") {
        return handleRun(repoRoot, req, res);
      }

      const artifactsMatch = /^\/api\/runs\/([^/]+)\/artifacts$/.exec(pathname);
      if (artifactsMatch && method === "GET") {
        return handleArtifacts(repoRoot, decodeURIComponent(artifactsMatch[1]), res);
      }
      const pdfMatch = /^\/api\/runs\/([^/]+)\/pdf$/.exec(pathname);
      if (pdfMatch && method === "GET") {
        return handlePdf(repoRoot, decodeURIComponent(pdfMatch[1]), res);
      }

      if (pathname.startsWith("/api/")) {
        return sendError(res, 404, `No route: ${method} ${pathname}`);
      }

      if (method === "GET") {
        return serveStatic(repoRoot, pathname, res);
      }

      sendError(res, 405, `Method not allowed: ${method} ${pathname}`);
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Request handler error:", err);
      if (!res.headersSent) {
        sendError(res, 500, err instanceof Error ? err.message : String(err));
      } else {
        res.end();
      }
    });
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Web server listening on http://localhost:${port}`);
    // eslint-disable-next-line no-console
    console.log(`  - REST:    http://localhost:${port}/api/sources`);
    // eslint-disable-next-line no-console
    console.log(`  - GraphQL: http://localhost:${port}/graphql`);
    // eslint-disable-next-line no-console
    console.log(`  - Static:  ${frontendDistDir(repoRoot)}`);
  });
}

await main();
