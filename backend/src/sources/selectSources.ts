import { SelectedSources, SelectedSourcesSchema, SourcesIndex } from "./types.js";
import type { SourceDoc } from "./types.js";
import { nowIso } from "../util/timeUtil.js";
import { normalizeCompanyName, tokenize } from "../util/textUtil.js";

export type SelectSourcesOpts = {
  jobText: string;
  jobPath: string;
  sourcesIndex: SourcesIndex;
  companyOverride?: string;
  focusOverride?: string;
  maxExperiences: number;
  maxBulletsPerExperience: number;
};

export function inferCompany(jobText: string): string | undefined {
  // Common patterns people paste into job.md
  const companyLine = /^\s*(company|employer)\s*:\s*(.+)\s*$/im.exec(jobText);
  if (companyLine) return normalizeCompanyName(companyLine[2]);

  // Heuristic: first non-empty line, but avoid “Job Description”.
  const firstLine = jobText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (firstLine && firstLine.length < 80 && !/job description/i.test(firstLine)) {
    // Something like “Talk To Medi — Full Stack Developer”
    const maybeCompany = firstLine.split(/[-—|]/)[0]?.trim();
    if (maybeCompany && maybeCompany.length >= 2) return normalizeCompanyName(maybeCompany);
  }

  const known = ["Talk To Medi", "Gastronomous", "University of Waterloo", "Waterloo Formula Electric"];
  for (const k of known) {
    if (new RegExp(`\\b${k.replace(/\s+/g, "\\s+")}\\b`, "i").test(jobText)) return k;
  }

  return undefined;
}

export function inferFocus(jobText: string): string | undefined {
  const t = jobText.toLowerCase();
  if (/full[-\s]?stack|frontend|backend|react|typescript|graphql/.test(t)) return "fullstack";
  if (/firmware|stm32|rtos|freertos|bare\s*metal/.test(t)) return "firmware";
  if (/embedded|can\s*bus|spi|i2c/.test(t)) return "embedded";
  if (/machine\s*learning|artificial\s+intelligence|computer\s*vision|nlp\b/.test(t)) return "ai";
  return undefined;
}

function scoreTextAgainstJob(jobTokens: Set<string>, text: string, tags: string[]): number {
  const tokens = tokenize(text);
  let score = 0;
  for (const tok of tokens) {
    if (jobTokens.has(tok)) score += 1;
  }
  for (const tag of tags) {
    if (jobTokens.has(tag)) score += 3;
  }
  return score;
}

export function selectSources(opts: SelectSourcesOpts): SelectedSources {
  const company = opts.companyOverride ?? inferCompany(opts.jobText);
  const focus = opts.focusOverride ?? inferFocus(opts.jobText);

  const jobTokens = new Set<string>(tokenize(opts.jobText));
  // Treat focus as a hint keyword.
  if (focus) jobTokens.add(focus);

  // Build experience groups from indexed docs.
  const expDocs = opts.sourcesIndex.docs.filter((d: SourceDoc) => d.kind === "experience");
  const eduDocs = opts.sourcesIndex.docs.filter((d: SourceDoc) => d.kind === "education");

  const expByGroup = new Map<string, typeof expDocs>();
  for (const doc of expDocs) {
    const key = doc.group;
    expByGroup.set(key, [...(expByGroup.get(key) ?? []), doc]);
  }

  const experienceRanked = [...expByGroup.entries()]
    .map(([group, docs]) => {
      const bestDocScore = Math.max(
        ...docs.map((d: SourceDoc) => scoreTextAgainstJob(jobTokens, [d.title, d.text, ...d.bullets].join("\n"), d.tags))
      );
      return { group, docs, score: bestDocScore };
    })
    .sort((a, b) => b.score - a.score);

  const selectedExperiences = experienceRanked.slice(0, opts.maxExperiences).map((entry) => {
    const overview = entry.docs.find((d: SourceDoc) => /\/overview\.md$/i.test(d.path));
    const companyName = overview?.title ?? entry.group;
    const role = overview?.meta.role;
    const location = overview?.meta.location;
    const duration = overview?.meta.duration;

    // Candidate bullets across all docs within this group.
    const candidates: Array<{ text: string; evidence: string; score: number }> = [];
    for (const doc of entry.docs) {
      for (const b of doc.bullets) {
        const score = scoreTextAgainstJob(jobTokens, b, doc.tags);
        if (score <= 0) continue;
        candidates.push({ text: b, evidence: doc.path, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    const bullets = candidates.slice(0, opts.maxBulletsPerExperience).map((c) => ({
      text: c.text,
      evidence: [c.evidence],
      score: c.score
    }));

    const evidence = [...new Set(bullets.flatMap((b) => b.evidence))];

    return {
      company: companyName,
      role,
      location,
      duration,
      bullets,
      evidence
    };
  });

  const selectedEducation = eduDocs
    .filter((d: SourceDoc) => /\/overview\.md$/i.test(d.path))
    .map((d: SourceDoc) => ({
      school: d.title,
      diploma: d.meta.diploma,
      location: d.meta.location,
      duration: d.meta.duration,
      gpa: d.meta.gpa,
      bullets: [],
      evidence: [d.path]
    }));

  const selection: SelectedSources = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    job: {
      path: opts.jobPath,
      company,
      focus
    },
    experience: selectedExperiences,
    education: selectedEducation,
    projects: []
  };

  return SelectedSourcesSchema.parse(selection);
}
