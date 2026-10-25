"""Regressions for the skill packager's output handling."""

import runpy
import zipfile
from pathlib import Path

import pytest

SCRIPT = (
    Path(__file__).resolve().parents[2]
    / "skills/public/skill-creator/scripts/package_skill.py"
)


@pytest.fixture
def package_skill(monkeypatch):
    monkeypatch.syspath_prepend(str(SCRIPT.parents[1]))
    return runpy.run_path(str(SCRIPT))["package_skill"]


def _write_skill(skill_dir: Path) -> None:
    (skill_dir / "references").mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: demo-skill\ndescription: demo skill used by packager tests\n---\n\nBody.\n",
        encoding="utf-8",
    )
    (skill_dir / "references" / "note.md").write_text("note", encoding="utf-8")


@pytest.mark.parametrize("into", [".", "nested/deeper"])
def test_packager_rejects_an_output_path_inside_the_skill_folder(
    tmp_path, package_skill, capsys, into
):
    """The archive is built by walking the skill folder; an output location
    inside that tree is visited mid-write, so the packager would zip its own
    half-written .skill into the archive. Colliding input/output paths must be
    rejected before anything is created (same contract as the podcast CLI)."""
    skill_dir = tmp_path / "demo-skill"
    _write_skill(skill_dir)

    result = package_skill(skill_dir, skill_dir / into)

    assert result is None
    assert "inside the skill folder" in capsys.readouterr().out
    assert not list(skill_dir.glob("*.skill"))


def test_packager_still_writes_a_clean_archive_outside_the_skill_folder(
    tmp_path, package_skill
):
    skill_dir = tmp_path / "demo-skill"
    _write_skill(skill_dir)
    out_dir = tmp_path / "dist"

    result = package_skill(skill_dir, out_dir)

    assert result is not None
    with zipfile.ZipFile(result) as archive:
        assert sorted(archive.namelist()) == [
            "demo-skill/SKILL.md",
            "demo-skill/references/note.md",
        ]
