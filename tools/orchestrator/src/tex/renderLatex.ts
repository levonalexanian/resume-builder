import path from "node:path";
import Mustache from "mustache";
import { SelectedSources } from "../sources/types.js";
import { ResumeConfig } from "../resumeConfig/types.js";

export type RenderLatexOpts = {
  templateText: string;
  resumeConfig: ResumeConfig;
  selection: SelectedSources;
  repoRoot: string;
};

function latexEscape(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("&", "\\&")
    .replaceAll("%", "\\%")
    .replaceAll("$", "\\$")
    .replaceAll("#", "\\#")
    .replaceAll("_", "\\_")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("~", "\\textasciitilde{}")
    .replaceAll("^", "\\textasciicircum{}")
    .replaceAll("|", "\\textbar{}")
    .replaceAll("<", "\\textless{}")
    .replaceAll(">", "\\textgreater{}");
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function renderExperienceSection(selection: SelectedSources): { latex: string; evidencePaths: string[] } {
  const evidence: string[] = [];

  const blocks = selection.experience
    .filter((e) => e.bullets.length > 0)
    .map((e) => {
      evidence.push(...e.evidence);

      const bulletsLatex = e.bullets
        .map((b) => {
          evidence.push(...b.evidence);
          return `\\resumeItem{${latexEscape(b.text)}}`;
        })
        .join("\n      ");

      const headerCompany = latexEscape(e.company);
      const headerLocation = latexEscape(e.location ?? "");
      const headerRole = latexEscape(e.role ?? "");
      const headerDuration = latexEscape(e.duration ?? "");

      return `\\resumeSubheading
      {${headerCompany}}{${headerLocation}}
      {${headerRole}}{${headerDuration}}
      \\resumeItemListStart
      ${bulletsLatex}
      \\resumeItemListEnd`;
    });

  if (blocks.length === 0) {
    return { latex: "\\textit{[Experience section placeholder]}", evidencePaths: [] };
  }

  return {
    latex: `\\resumeSubHeadingListStart\n    ${blocks.join("\n\n    ")}\n  \\resumeSubHeadingListEnd`,
    evidencePaths: [...new Set(evidence)]
  };
}

function renderProjectsSection(selection: SelectedSources): { latex: string; evidencePaths: string[] } {
  const evidence: string[] = [];
  const projects = (selection.projects ?? []) as Array<{
    title?: string;
    duration?: string;
    evidence?: string[];
    bullets?: Array<{ text: string; evidence?: string[] }>;
  }>;

  const blocks = projects
    .filter((p) => p && (p.bullets?.length ?? 0) > 0)
    .map((p) => {
      for (const e of p.evidence ?? []) evidence.push(e);
      const title = latexEscape(p.title ?? "Project");
      const duration = latexEscape(p.duration ?? "");
      const items = (p.bullets ?? [])
        .map((b) => {
          for (const e of b.evidence ?? []) evidence.push(e);
          return `\\resumeItem{${latexEscape(b.text)}}`;
        })
        .join("\n      ");
      return `\\resumeProjectHeading
      {\\textbf{${title}}}{${duration}}
      \\resumeItemListStart
      ${items}
      \\resumeItemListEnd`;
    });

  if (blocks.length === 0) {
    return { latex: "\\textit{[Projects section placeholder]}", evidencePaths: [] };
  }
  return {
    latex: `\\resumeSubHeadingListStart\n    ${blocks.join("\n\n    ")}\n  \\resumeSubHeadingListEnd`,
    evidencePaths: [...new Set(evidence)]
  };
}

function renderEducationSection(selection: SelectedSources): { latex: string; evidencePaths: string[] } {
  const evidence: string[] = [];
  const blocks = selection.education.map((e) => {
    evidence.push(...e.evidence);
    const school = latexEscape(e.school);
    const location = latexEscape(e.location ?? "");
    const diplomaGpa = [e.diploma, e.gpa ? `GPA: ${e.gpa}` : undefined].filter(Boolean).join(", ");
    const diploma = latexEscape(diplomaGpa);
    const duration = latexEscape(e.duration ?? "");

    return `\\resumeSubheading
      {${school}}{${location}}
      {${diploma}}{${duration}}`;
  });

  if (blocks.length === 0) {
    return { latex: "\\textit{[Education section placeholder]}", evidencePaths: [] };
  }

  return {
    latex: `\\resumeSubHeadingListStart\n    ${blocks.join("\n    ")}\n  \\resumeSubHeadingListEnd`,
    evidencePaths: [...new Set(evidence)]
  };
}

export function renderLatex(opts: RenderLatexOpts): { latex: string; evidencePaths: string[] } {
  const experience = renderExperienceSection(opts.selection);
  const education = renderEducationSection(opts.selection);
  const projects = renderProjectsSection(opts.selection);

  const emailHref = opts.resumeConfig.email ?? "";
  const emailText = latexEscape(opts.resumeConfig.email ?? "");

  const linkedinHref = opts.resumeConfig.linkedinUrl ?? "";
  const linkedinText = latexEscape(
    opts.resumeConfig.linkedinDisplay ?? (linkedinHref ? stripScheme(linkedinHref) : "")
  );

  const githubHref = opts.resumeConfig.githubUrl ?? "";
  const githubText = latexEscape(opts.resumeConfig.githubDisplay ?? (githubHref ? stripScheme(githubHref) : ""));

  const view = {
    NAME: latexEscape(opts.resumeConfig.name),
    PHONE: latexEscape(opts.resumeConfig.phone ?? ""),
    EMAIL_HREF: `mailto:${emailHref}`,
    EMAIL_TEXT: emailText,
    LINKEDIN_HREF: linkedinHref,
    LINKEDIN_TEXT: linkedinText,
    GITHUB_HREF: githubHref,
    GITHUB_TEXT: githubText,
    EXPERIENCE_SECTION: experience.latex,
    PROJECTS_SECTION: projects.latex,
    SKILLS_SECTION: opts.resumeConfig.skillsLatex ?? "\\textit{[Technical Skills section placeholder]}",
    EDUCATION_SECTION: education.latex
  };

  const latex = Mustache.render(opts.templateText, view, undefined, { escape: (v) => v });

  const evidencePaths = [
    ...new Set([...experience.evidencePaths, ...education.evidencePaths, ...projects.evidencePaths])
  ].map((p) => path.posix.normalize(p.replaceAll("\\", "/")));

  return { latex, evidencePaths };
}
