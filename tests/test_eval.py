"""Evaluation harness for the JobFit tailoring pipeline.

Two layers:

1. **Offline metric unit tests** — validate the metrics themselves against
   hand-built cases (a fabricating output must fail, an honest output must
   pass). These run without any API access and always run in CI.

2. **Live pipeline eval** (``@pytest.mark.live``) — runs the real LangGraph
   pipeline against the golden set in ``tests/golden/`` and asserts the
   metrics pass. Requires ``GOOGLE_API_KEY`` in the environment, so it is
   opt-in:

       pytest -m live          # run only live eval
       pytest -m "not live"    # default CI mode

Run the live eval as a report (scores per case) with:

       python -m tests.eval_report
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from backend.models.schemas import ParsedResume
from tests.eval_metrics import (
    entity_faithfulness,
    jd_keyword_coverage,
    structure_preservation,
)

GOLDEN_PATH = Path(__file__).parent / "golden" / "resume_jd_pairs.json"


def load_golden() -> list[dict]:
    with open(GOLDEN_PATH, encoding="utf-8") as f:
        return json.load(f)


def golden_resume(case: dict) -> ParsedResume:
    """Accept either a full golden case ({id, resume, jd}) or a raw resume dict."""
    payload = case["resume"] if "resume" in case else case
    return ParsedResume.model_validate(payload)


# ---------------------------------------------------------------------------
# Offline metric unit tests
# ---------------------------------------------------------------------------

class TestEntityFaithfulness:
    def test_honest_output_passes(self):
        """An output that only reuses input entities must score 1.0."""
        input_resume = golden_resume(load_golden()[0])
        output_resume = copy.deepcopy(input_resume)
        output_resume.summary = "Backend engineer aligned to the Senior Backend Engineer role."

        result = entity_faithfulness(input_resume, output_resume)
        assert result.passed, f"unexpected violations: {result.violations}"
        assert result.score == 1.0

    def test_fabricated_skill_fails(self):
        """Adding a skill that exists nowhere in the input must be flagged."""
        input_resume = golden_resume(load_golden()[0])
        output_resume = copy.deepcopy(input_resume)
        output_resume.skills.append("Apache Flink")

        result = entity_faithfulness(input_resume, output_resume)
        assert not result.passed
        assert any("Apache Flink" in v for v in result.violations)

    def test_fabricated_employer_fails(self):
        input_resume = golden_resume(load_golden()[0])
        output_resume = copy.deepcopy(input_resume)
        output_resume.experience[0].company = "Meta"

        result = entity_faithfulness(input_resume, output_resume)
        assert not result.passed
        assert any("Meta" in v for v in result.violations)

    def test_surfacing_prose_skill_passes(self):
        """A skill named in input bullets (not in the skills list) is allowed
        to be surfaced into the output skills list — that's tailoring, not
        fabrication."""
        input_resume = golden_resume(load_golden()[2])
        output_resume = copy.deepcopy(input_resume)
        output_resume.skills.append("A/B testing")  # appears in bullets only

        result = entity_faithfulness(input_resume, output_resume)
        assert result.passed, f"unexpected violations: {result.violations}"


class TestJDKeywordCoverage:
    def test_strong_overlap_scores_high(self):
        """The strong-overlap resume must cover most REQUIRED skills even
        before tailoring. (JD *keywords* are what tailoring adds, so the raw
        resume is only asserted against required_skills here.)"""
        case = load_golden()[0]
        output_resume = golden_resume(case["resume"])
        jd = case["jd"]

        result = jd_keyword_coverage(jd["required_skills"], None, output_resume)
        assert result.score >= 0.8, f"violations: {result.violations}"

    def test_keywords_are_tailoring_headroom(self):
        """Abstract JD keywords ('high-throughput', 'event-driven') are absent
        from the raw resume — that residual gap is the measurable work the
        tailor step does, while concrete skills are already present."""
        case = load_golden()[0]
        output_resume = golden_resume(case["resume"])
        jd = case["jd"]

        result = jd_keyword_coverage(
            jd["required_skills"], jd["keywords"], output_resume
        )
        assert result.score < 1.0  # headroom exists
        assert any("high-throughput" in v for v in result.violations)
        assert any("event-driven" in v for v in result.violations)

    def test_mismatch_case_fails_threshold(self):
        """The frontend-vs-data-engineering case must fail coverage (input
        resume simply does not contain the JD vocabulary)."""
        case = load_golden()[1]
        output_resume = golden_resume(case["resume"])
        jd = case["jd"]

        result = jd_keyword_coverage(jd["required_skills"], None, output_resume)
        assert result.score < 0.8

    def test_empty_output_scores_zero(self):
        case = load_golden()[0]
        empty = ParsedResume(
            name="", contact_info="", summary="",
            experience=[], education=[], skills=[],
        )
        result = jd_keyword_coverage(
            case["jd"]["required_skills"], case["jd"]["keywords"], empty
        )
        assert result.score == 0.0


class TestStructurePreservation:
    def test_identity_transform_passes(self):
        input_resume = golden_resume(load_golden()[0])
        output_resume = copy.deepcopy(input_resume)
        output_resume.experience.reverse()  # reordering allowed

        result = structure_preservation(input_resume, output_resume)
        assert result.passed, f"unexpected violations: {result.violations}"

    def test_bullet_padding_fails(self):
        input_resume = golden_resume(load_golden()[0])
        output_resume = copy.deepcopy(input_resume)
        output_resume.experience[0].bullets.append(
            "Led a 12-person team across three continents to atomic precision"
        )

        result = structure_preservation(input_resume, output_resume)
        assert not result.passed
        assert any("padded" in v for v in result.violations)

    def test_experience_deletion_fails(self):
        input_resume = golden_resume(load_golden()[0])
        output_resume = copy.deepcopy(input_resume)
        output_resume.experience = output_resume.experience[:1]

        result = structure_preservation(input_resume, output_resume)
        assert not result.passed
        assert any("dropped" in v or "shrank" in v for v in result.violations)

    def test_moderate_rephrase_passes(self):
        """Dropping up to 25% of bullets (tightening) is allowed."""
        input_resume = golden_resume(load_golden()[0])
        output_resume = copy.deepcopy(input_resume)
        output_resume.experience[0].bullets = output_resume.experience[0].bullets[:2]

        result = structure_preservation(input_resume, output_resume)
        assert result.passed, f"unexpected violations: {result.violations}"


# ---------------------------------------------------------------------------
# Live pipeline eval (opt-in)
# ---------------------------------------------------------------------------

def _build_state(case: dict) -> dict:
    return build_state(case)


def build_state(case: dict) -> dict:
    """Shared state builder for live pipeline eval (used by eval_report too)."""
    jd = case["jd"]
    return {
        "raw_jd": (
            f"Role: {jd['role_title']} at {jd['company']}\n"
            f"Required skills: {', '.join(jd['required_skills'])}\n"
            f"Preferred skills: {', '.join(jd.get('preferred_skills') or [])}\n"
            f"Seniority: {jd['seniority']}\n"
            f"Responsibilities:\n" + "\n".join(f"- {r}" for r in jd["responsibilities"])
        ),
        "parsed_resume": golden_resume(case["resume"]),
        "tone": "professional",
        "missing_requirements": None,
        "github_signal": None,
    }


@pytest.mark.live
@pytest.mark.parametrize("case", load_golden(), ids=lambda c: c["id"])
class TestLivePipelineEval:
    @pytest.fixture(autouse=True)
    def _require_api_key(self):
        import os

        if not os.getenv("GOOGLE_API_KEY") and not os.getenv("GEMINI_API_KEY"):
            pytest.skip("GOOGLE_API_KEY not set — skipping live eval")

    @pytest.fixture(scope="class")
    def compiled_pipeline(self):
        from backend.pipeline.graph import create_pipeline_graph

        return create_pipeline_graph()

    def test_faithfulness(self, compiled_pipeline, case):
        final = compiled_pipeline.invoke(_build_state(case), config={"recursion_limit": 25})
        assert "errors" not in final or not final["errors"], f"pipeline errors: {final.get('errors')}"
        tailored = final.get("tailored_resume")
        assert tailored is not None, "tailor_resume produced no output"

        result = entity_faithfulness(golden_resume(case["resume"]), tailored)
        assert result.passed, (
            f"[{case['id']}] fabricated entities detected: {result.violations}"
        )

    def test_structure(self, compiled_pipeline, case):
        final = compiled_pipeline.invoke(_build_state(case), config={"recursion_limit": 25})
        tailored = final.get("tailored_resume")
        assert tailored is not None

        result = structure_preservation(golden_resume(case["resume"]), tailored)
        assert result.passed, (
            f"[{case['id']}] structure violations: {result.violations}"
        )

    def test_coverage(self, compiled_pipeline, case):
        final = compiled_pipeline.invoke(_build_state(case), config={"recursion_limit": 25})
        tailored = final.get("tailored_resume")
        assert tailored is not None

        result = jd_keyword_coverage(
            case["jd"]["required_skills"], case["jd"].get("keywords"), tailored
        )
        # Mismatch cases may honestly fail coverage — the no-fabrication
        # contract outranks keyword stuffing (golden set sets the expectation).
        expect_pass = case.get("expected_coverage_pass", True)
        if expect_pass:
            assert result.score >= 0.8, (
                f"[{case['id']}] coverage {result.score:.2f} < 0.8; missing: {result.violations}"
            )
        else:
            assert result.score < 0.8, (
                f"[{case['id']}] mismatch case unexpectedly covered {result.score:.2f} — "
                f"investigate possible keyword stuffing"
            )
