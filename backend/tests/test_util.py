from __future__ import annotations

from datetime import datetime

from resume_orchestrator.sources.md_parse import (
    extract_tags_from_text,
    parse_markdown_bullets,
    parse_metadata_lines,
)
from resume_orchestrator.util.date_util import (
    freshness_score,
    parse_date_range,
    parse_loose_date,
)
from resume_orchestrator.util.env import parse_boolean
from resume_orchestrator.util.text_util import tokenize


class TestParseLooseDate:
    def test_full_month_name(self) -> None:
        d = parse_loose_date("September 2025")
        assert d is not None
        assert (d.year, d.month) == (2025, 9)

    def test_abbreviated_with_period(self) -> None:
        sept = parse_loose_date("Sept. 2025")
        apr = parse_loose_date("Apr. 2030")
        assert sept is not None
        assert apr is not None
        assert (sept.year, sept.month) == (2025, 9)
        assert (apr.year, apr.month) == (2030, 4)


class TestParseDateRange:
    def test_end_dated(self) -> None:
        r = parse_date_range("July 2025 – May 2026")
        assert r.start is not None and (r.start.year, r.start.month) == (2025, 7)
        assert r.end is not None and (r.end.year, r.end.month) == (2026, 5)
        assert r.ongoing is False

    def test_present_range(self) -> None:
        r = parse_date_range("September 2025 – Present")
        assert r.start is not None and (r.start.year, r.start.month) == (2025, 9)
        assert r.ongoing is True
        assert r.end is None

    def test_expected_end_date(self) -> None:
        r = parse_date_range("September 2025 – April 2030 (expected)")
        assert r.start is not None and (r.start.year, r.start.month) == (2025, 9)
        assert r.end is not None and (r.end.year, r.end.month) == (2030, 4)


class TestFreshnessScore:
    NOW = datetime(2026, 6, 1)

    def test_ongoing_scores_one(self) -> None:
        assert freshness_score("September 2025 – Present", self.NOW) == 1.0

    def test_ended_last_month(self) -> None:
        assert freshness_score("Jan 2025 – May 2026", self.NOW) == 1.0

    def test_ended_five_years_ago(self) -> None:
        assert freshness_score("Jan 2018 – Jan 2021", self.NOW) == 0.0

    def test_unknown_duration(self) -> None:
        assert freshness_score(None, self.NOW) == 0.0

    def test_monotone_decay(self) -> None:
        earlier = freshness_score("Jan 2024 – Jan 2025", self.NOW)
        later = freshness_score("Jan 2024 – Jan 2026", self.NOW)
        assert later > earlier


class TestParseBoolean:
    def test_truthy(self) -> None:
        for v in ("true", "TRUE", "1", "yes", "YES", "on"):
            assert parse_boolean(v) is True

    def test_falsy(self) -> None:
        for v in (None, "", "false", "0", "no", "off", "maybe"):
            assert parse_boolean(v) is False


class TestParseMarkdownBullets:
    def test_drops_pseudo_bullets(self) -> None:
        md = "\n".join(
            [
                "- **Diploma:** Bachelor",
                "- **Role:** Software Engineer",
                "- Built a thing",
            ]
        )
        assert parse_markdown_bullets(md) == ["Built a thing"]

    def test_drops_markdown_links(self) -> None:
        md = "- [Project](https://example.com)\n- Real bullet"
        assert parse_markdown_bullets(md) == ["Real bullet"]


class TestParseMetadataLines:
    def test_normalizes_common_keys(self) -> None:
        meta = parse_metadata_lines(
            "\n".join(
                [
                    "- **Position:** Software Engineer",
                    "- **Location:** Toronto",
                    "- **Duration:** Jan 2024 – Present",
                    "- **GPA:** 4.0",
                ]
            )
        )
        assert meta["role"] == "Software Engineer"
        assert meta["location"] == "Toronto"
        assert meta["duration"] == "Jan 2024 – Present"
        assert meta["gpa"] == "4.0"


class TestExtractTagsFromText:
    def test_core_stack(self) -> None:
        tags = extract_tags_from_text("Built a TypeScript service with React and GraphQL on AWS.")
        for expected in ("typescript", "react", "graphql", "aws"):
            assert expected in tags

    def test_embedded_firmware(self) -> None:
        tags = extract_tags_from_text("STM32 firmware over CAN bus with FreeRTOS.")
        for expected in ("stm32", "firmware", "can", "freertos"):
            assert expected in tags


class TestTokenize:
    def test_drops_stop_words_and_short_tokens(self) -> None:
        tokens = tokenize("The quick brown fox and a cat")
        assert "quick" in tokens
        assert "brown" in tokens
        assert "fox" in tokens
        assert "the" not in tokens
        assert "and" not in tokens
