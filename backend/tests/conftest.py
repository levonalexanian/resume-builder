from __future__ import annotations

import shutil
from pathlib import Path

import pytest

REAL_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _has_real_markdown(root: Path) -> bool:
    for subdir in ("experience", "education", "projects"):
        for md in (root / subdir).rglob("*.md"):
            if ".example.md" not in md.name:
                return True
    return False


def _materialize_examples(src_root: Path, dest_root: Path) -> None:
    """Copy *.example.md files from src_root into dest_root as plain *.md.

    Used so the test suite has indexable source content when the repo only
    ships example files (e.g. CI, fresh worktree)."""
    for subdir in ("experience", "education", "projects"):
        for example in (src_root / subdir).rglob("*.example.md"):
            rel = example.relative_to(src_root)
            renamed = rel.with_name(rel.name.replace(".example.md", ".md"))
            dest = dest_root / renamed
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(example, dest)


@pytest.fixture(scope="session")
def repo_root(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Repo root used by tests.

    Prefer the worktree's real markdown when present (developer machine);
    otherwise stage a temporary copy of the bundled *.example.md files so
    the pipeline has something to index."""
    if _has_real_markdown(REAL_REPO_ROOT):
        return REAL_REPO_ROOT

    staged = tmp_path_factory.mktemp("resume-repo")
    for entry in ("templates", "scripts", "resume.config.json.example"):
        src = REAL_REPO_ROOT / entry
        if not src.exists():
            continue
        dest = staged / entry
        if src.is_dir():
            shutil.copytree(src, dest)
        else:
            shutil.copyfile(src, dest)
    config_example = staged / "resume.config.json.example"
    if config_example.exists():
        shutil.copyfile(config_example, staged / "resume.config.json")
    _materialize_examples(REAL_REPO_ROOT, staged)
    return staged
