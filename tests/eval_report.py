"""Standalone eval-report runner.

Executes the LangGraph pipeline over the golden set and prints a per-case
score table with metric breakdowns. Requires GOOGLE_API_KEY in the env.

Usage:
    python -m tests.eval_report
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.pipeline.graph import create_pipeline_graph  # noqa: E402
from tests.eval_metrics import (  # noqa: E402
    entity_faithfulness,
    jd_keyword_coverage,
    structure_preservation,
)
from tests.test_eval import build_state, golden_resume, load_golden  # noqa: E402


async def run_case(pipeline, case: dict) -> dict:
    print(f"\n=== {case['id']} — {case['jd']['role_title']} at {case['jd']['company']} ===")
    start = time.time()
    try:
        final = await pipeline.ainvoke(build_state(case), config={"recursion_limit": 25})
    except Exception as exc:  # noqa: BLE001
        print(f"  PIPELINE FAILED: {exc}")
        return {"id": case["id"], "faithfulness": None, "structure": None,
                "coverage": None, "violations": [str(exc)], "latency_s": None}
    elapsed = time.time() - start

    errors = final.get("errors") or []
    tailored = final.get("tailored_resume")
    if errors or tailored is None:
        print(f"  ERRORS: {errors or ['no tailored_resume produced']}")
        return {"id": case["id"], "faithfulness": None, "structure": None,
                "coverage": None, "violations": errors or ["no output"],
                "latency_s": round(elapsed, 1)}

    input_resume = golden_resume(case["resume"])
    faith = entity_faithfulness(input_resume, tailored)
    struct = structure_preservation(input_resume, tailored)
    cover = jd_keyword_coverage(
        case["jd"]["required_skills"], case["jd"].get("keywords"), tailored
    )

    print(f"  entity_faithfulness  : {faith.score:.3f}  {'PASS' if faith.passed else 'FAIL'}")
    for v in faith.violations:
        print(f"      - {v}")
    print(f"  structure_preservation: {struct.score:.3f}  {'PASS' if struct.passed else 'FAIL'}")
    for v in struct.violations:
        print(f"      - {v}")
    print(f"  jd_keyword_coverage  : {cover.score:.3f}  {'PASS' if cover.passed else 'FAIL'}")
    for v in cover.violations:
        print(f"      - {v}")
    print(f"  latency: {elapsed:.1f}s  |  interview questions: {len(final.get('interview_questions') or [])}"
          f"  |  ATS issues: {len(final.get('ats_issues') or [])}")

    return {
        "id": case["id"],
        "faithfulness": faith.score,
        "structure": struct.score,
        "coverage": cover.score,
        "violations": faith.violations + struct.violations + cover.violations,
        "latency_s": round(elapsed, 1),
    }


async def main() -> int:
    cases = load_golden()
    pipeline = create_pipeline_graph()
    rows = [await run_case(pipeline, case) for case in cases]

    print("\n" + "=" * 72)
    print(f"{'case':<10} {'faithfulness':>13} {'structure':>10} {'coverage':>9} {'latency':>8}")
    print("-" * 72)
    all_pass = True
    for case, r in zip(cases, rows):
        if r["faithfulness"] is None:
            print(f"{r['id']:<10} {'FAILED':>13}")
            all_pass = False
            continue
        expect_pass = case.get("expected_coverage_pass", True)
        coverage_ok = r["coverage"] >= 0.8 if expect_pass else r["coverage"] < 0.8
        ok = r["faithfulness"] == 1.0 and r["structure"] == 1.0 and coverage_ok
        all_pass = all_pass and ok
        print(f"{r['id']:<10} {r['faithfulness']:>13.3f} {r['structure']:>10.3f} "
              f"{r['coverage']:>9.3f} {r['latency_s']:>7.1f}s")
    print("=" * 72)
    print("OVERALL:", "PASS" if all_pass else "FAIL")
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
