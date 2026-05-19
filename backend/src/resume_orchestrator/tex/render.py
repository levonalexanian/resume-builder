from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath

from jinja2 import Environment

from ..resume_config.types import ResumeConfig
from ..sources.types import SelectedSources

_LATEX_ESCAPE: list[tuple[str, str]] = [
    ("\\", "\\\\"),
    ("&", "\\&"),
    ("%", "\\%"),
    ("$", "\\$"),
    ("#", "\\#"),
    ("_", "\\_"),
    ("{", "\\{"),
    ("}", "\\}"),
    ("~", "\\textasciitilde{}"),
    ("^", "\\textasciicircum{}"),
    ("|", "\\textbar{}"),
    ("<", "\\textless{}"),
    (">", "\\textgreater{}"),
]

_SCHEME_RE = re.compile(r"^https?://", re.IGNORECASE)
_TRAILING_SLASH_RE = re.compile(r"/$")


def latex_escape(text: str) -> str:
    out = text
    for needle, replacement in _LATEX_ESCAPE:
        out = out.replace(needle, replacement)
    return out


def _strip_scheme(url: str) -> str:
    no_scheme = _SCHEME_RE.sub("", url)
    return _TRAILING_SLASH_RE.sub("", no_scheme)


@dataclass(slots=True)
class RenderedSection:
    latex: str
    evidence_paths: list[str]


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        if it in seen:
            continue
        seen.add(it)
        out.append(it)
    return out


def _render_experience(selection: SelectedSources) -> RenderedSection:
    evidence: list[str] = []
    blocks: list[str] = []
    for entry in selection.experience:
        if not entry.bullets:
            continue
        evidence.extend(entry.evidence)
        bullet_lines: list[str] = []
        for bullet in entry.bullets:
            evidence.extend(bullet.evidence)
            bullet_lines.append(f"\\resumeItem{{{latex_escape(bullet.text)}}}")
        bullets_latex = "\n      ".join(bullet_lines)

        header_company = latex_escape(entry.company)
        header_location = latex_escape(entry.location or "")
        header_role = latex_escape(entry.role or "")
        header_duration = latex_escape(entry.duration or "")

        blocks.append(
            f"\\resumeSubheading\n"
            f"      {{{header_company}}}{{{header_location}}}\n"
            f"      {{{header_role}}}{{{header_duration}}}\n"
            f"      \\resumeItemListStart\n"
            f"      {bullets_latex}\n"
            f"      \\resumeItemListEnd"
        )

    if not blocks:
        return RenderedSection(latex="\\textit{[Experience section placeholder]}", evidence_paths=[])

    body = "\n\n    ".join(blocks)
    latex = f"\\resumeSubHeadingListStart\n    {body}\n  \\resumeSubHeadingListEnd"
    return RenderedSection(latex=latex, evidence_paths=_dedupe(evidence))


def _render_projects(selection: SelectedSources) -> RenderedSection:
    evidence: list[str] = []
    blocks: list[str] = []
    for project in selection.projects or []:
        if not isinstance(project, dict):
            continue
        bullets_raw = project.get("bullets") or []
        if not bullets_raw:
            continue
        for ev in project.get("evidence") or []:
            evidence.append(ev)

        title = latex_escape(project.get("title") or "Project")
        duration = latex_escape(project.get("duration") or "")
        items: list[str] = []
        for b in bullets_raw:
            if not isinstance(b, dict):
                continue
            for ev in b.get("evidence") or []:
                evidence.append(ev)
            items.append(f"\\resumeItem{{{latex_escape(b.get('text') or '')}}}")
        items_latex = "\n      ".join(items)

        blocks.append(
            f"\\resumeProjectHeading\n"
            f"      {{\\textbf{{{title}}}}}{{{duration}}}\n"
            f"      \\resumeItemListStart\n"
            f"      {items_latex}\n"
            f"      \\resumeItemListEnd"
        )

    if not blocks:
        return RenderedSection(latex="\\textit{[Projects section placeholder]}", evidence_paths=[])
    body = "\n\n    ".join(blocks)
    latex = f"\\resumeSubHeadingListStart\n    {body}\n  \\resumeSubHeadingListEnd"
    return RenderedSection(latex=latex, evidence_paths=_dedupe(evidence))


def _render_education(selection: SelectedSources) -> RenderedSection:
    evidence: list[str] = []
    blocks: list[str] = []
    for entry in selection.education:
        evidence.extend(entry.evidence)
        school = latex_escape(entry.school)
        location = latex_escape(entry.location or "")
        parts = [entry.diploma]
        if entry.gpa:
            parts.append(f"GPA: {entry.gpa}")
        diploma_gpa = ", ".join(p for p in parts if p)
        diploma = latex_escape(diploma_gpa)
        duration = latex_escape(entry.duration or "")
        blocks.append(
            f"\\resumeSubheading\n"
            f"      {{{school}}}{{{location}}}\n"
            f"      {{{diploma}}}{{{duration}}}"
        )

    if not blocks:
        return RenderedSection(latex="\\textit{[Education section placeholder]}", evidence_paths=[])
    body = "\n    ".join(blocks)
    latex = f"\\resumeSubHeadingListStart\n    {body}\n  \\resumeSubHeadingListEnd"
    return RenderedSection(latex=latex, evidence_paths=_dedupe(evidence))


_MUSTACHE_DELIM_DIRECTIVE = re.compile(r"\{\{=<<\s+>>=\}\}\s*\n?")


def _build_env() -> Environment:
    return Environment(
        variable_start_string="<<",
        variable_end_string=">>",
        block_start_string="<%",
        block_end_string="%>",
        comment_start_string="<#",
        comment_end_string="#>",
        autoescape=False,
        keep_trailing_newline=True,
    )


@dataclass(slots=True)
class RenderLatexResult:
    latex: str
    evidence_paths: list[str]


def render_latex(
    template_text: str,
    resume_config: ResumeConfig,
    selection: SelectedSources,
    repo_root: str,
) -> RenderLatexResult:
    experience = _render_experience(selection)
    education = _render_education(selection)
    projects = _render_projects(selection)

    email_href = resume_config.email or ""
    email_text = latex_escape(resume_config.email or "")

    linkedin_href = resume_config.linkedinUrl or ""
    linkedin_text = latex_escape(
        resume_config.linkedinDisplay or (_strip_scheme(linkedin_href) if linkedin_href else "")
    )

    github_href = resume_config.githubUrl or ""
    github_text = latex_escape(
        resume_config.githubDisplay or (_strip_scheme(github_href) if github_href else "")
    )

    view = {
        "NAME": latex_escape(resume_config.name),
        "PHONE": latex_escape(resume_config.phone or ""),
        "EMAIL_HREF": f"mailto:{email_href}",
        "EMAIL_TEXT": email_text,
        "LINKEDIN_HREF": linkedin_href,
        "LINKEDIN_TEXT": linkedin_text,
        "GITHUB_HREF": github_href,
        "GITHUB_TEXT": github_text,
        "EXPERIENCE_SECTION": experience.latex,
        "PROJECTS_SECTION": projects.latex,
        "SKILLS_SECTION": resume_config.skillsLatex or "\\textit{[Technical Skills section placeholder]}",
        "EDUCATION_SECTION": education.latex,
    }

    cleaned = _MUSTACHE_DELIM_DIRECTIVE.sub("", template_text)
    env = _build_env()
    latex = env.from_string(cleaned).render(view)

    combined = [*experience.evidence_paths, *education.evidence_paths, *projects.evidence_paths]
    evidence_paths = [
        PurePosixPath(p.replace("\\", "/")).as_posix() for p in _dedupe(combined)
    ]

    return RenderLatexResult(latex=latex, evidence_paths=evidence_paths)
