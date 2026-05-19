import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import { SourcesIndex, SourcesIndexSchema, SourceDoc } from "./types.js";
import { nowIso } from "../util/timeUtil.js";
import { safeSlug } from "../util/textUtil.js";
import { extractTagsFromText, parseMarkdownBullets, parseMarkdownHeadingTitle, parseMetadataLines } from "./mdParse.js";

export type IndexSourcesOpts = {
  root: string;
};

function makeId(rel: string): string {
  const noExt = rel.replace(/\.md$/i, "");
  return noExt.replace(/[^a-zA-Z0-9._/-]+/g, "-").toLowerCase();
}

function classifyKind(relPath: string): SourceDoc["kind"] {
  if (relPath.startsWith("experience/")) return "experience";
  if (relPath.startsWith("education/")) return "education";
  if (relPath.startsWith("projects/")) return "project";
  return "other";
}

function groupNameFromPath(relPath: string): string {
  const parts = relPath.split("/");
  if (parts.length < 2) return parts[0] ?? "unknown";
  // e.g. experience/gastronomous/fullstack.md => gastronomous
  return parts[1] ?? "unknown";
}

export async function indexSources(opts: IndexSourcesOpts): Promise<SourcesIndex> {
  const rootAbs = path.resolve(opts.root);

  const patterns = [
    "experience/**/*.md",
    "education/**/*.md",
    "projects/**/*.md"
  ];

  const matches = await fg(patterns, {
    cwd: rootAbs,
    dot: false,
    onlyFiles: true,
    unique: true,
    ignore: ["**/*.example.md"]
  });

  const docs: SourceDoc[] = [];

  for (const rel of matches.sort()) {
    const abs = path.join(rootAbs, rel);
    const raw = await fs.readFile(abs, "utf8");

    // gray-matter tolerates files without frontmatter.
    const parsed = matter(raw);
    const content = parsed.content;

    const title = parseMarkdownHeadingTitle(content) ?? path.basename(rel, path.extname(rel));
    const kind = classifyKind(rel);

    const meta = parseMetadataLines(content);

    const bullets = parseMarkdownBullets(content);

    const groupRaw = meta.company ?? meta.school ?? groupNameFromPath(rel);
    const group = groupRaw;
    const groupKey = safeSlug(groupRaw) || groupNameFromPath(rel);

    const tags = extractTagsFromText([rel, title, ...bullets, content].join("\n"));

    docs.push({
      id: makeId(rel),
      path: rel,
      kind,
      group,
      groupKey,
      title,
      meta,
      tags,
      bullets,
      text: content
    });
  }

  const index: SourcesIndex = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    docs
  };

  return SourcesIndexSchema.parse(index);
}
