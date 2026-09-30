import operator
from typing import Annotated, TypedDict

from langgraph.graph import END, StateGraph

from backend.models.schemas import CoverLetter, ParsedJD, ParsedResume, SkillGap
from backend.pipeline.nodes.analyze_gap import analyze_gap_node
from backend.pipeline.nodes.check_ats import check_ats_node
from backend.pipeline.nodes.generate_cover import generate_cover_node
from backend.pipeline.nodes.parse_jd import parse_jd_node
from backend.pipeline.nodes.parse_resume import parse_resume_node
from backend.pipeline.nodes.predict_questions import predict_questions_node
from backend.pipeline.nodes.tailor_resume import tailor_resume_node


class PipelineState(TypedDict):
    # Inputs
    raw_jd: str
    raw_resume: str | None
    tone: str
    missing_requirements: list[str] | None
    github_signal: str | None

    # Processed Data
    parsed_jd: ParsedJD | None
    parsed_resume: ParsedResume | None

    # Outputs
    tailored_resume: ParsedResume | None
    cover_letter: CoverLetter | None
    skill_gaps: list[SkillGap] | None
    interview_questions: list[str] | None
    ats_issues: list[str] | None

    # State tracking
    errors: Annotated[list[str], operator.add]

def create_pipeline_graph() -> StateGraph:
    """Create and compile the LangGraph DAG for the JobFit pipeline.

    Shape (parallel fan-out after JD parsing):

        entry (conditional)
          ├─ raw_resume needs parsing → parse_resume → parse_jd ─┐
          └─ resume already parsed → parse_jd ───────────────────┤
                                                                 │
                     ┌───────────────────────────────────────────┘
                     ├─→ analyze_gap ────────────→ END
                     ├─→ tailor_resume ──────────→ END
                     ├─→ generate_cover ─────────→ END
                     ├─→ predict_questions ──────→ END
                     └─→ check_ats ──────────────→ END

    All five output nodes depend only on (parsed_resume, parsed_jd) —
    check_ats additionally on raw_resume, which is present in state by
    the time parse_jd completes on every entry path — so they execute
    in parallel. Node outputs are disjoint state keys, and errors flow
    through the operator.add reducer, so concurrent updates are safe.
    """
    workflow = StateGraph(PipelineState)

    # Add nodes
    workflow.add_node("parse_jd", parse_jd_node)
    # Note: parse_resume is usually run separately when the user uploads it.
    # But if raw_resume is provided, we can parse it here.
    workflow.add_node("parse_resume", parse_resume_node)

    workflow.add_node("analyze_gap", analyze_gap_node)
    workflow.add_node("tailor_resume", tailor_resume_node)
    workflow.add_node("generate_cover", generate_cover_node)
    workflow.add_node("predict_questions", predict_questions_node)
    workflow.add_node("check_ats", check_ats_node)

    # Edges
    # We assume parsed_resume is already provided or parsed beforehand.
    # Let's conditionally route to parse_resume if needed, else parse_jd.
    def route_start(state: PipelineState) -> str:
        if state.get("parsed_resume") is None and state.get("raw_resume"):
            return "parse_resume"
        return "parse_jd"

    workflow.set_conditional_entry_point(
        route_start,
        {
            "parse_resume": "parse_resume",
            "parse_jd": "parse_jd"
        }
    )

    workflow.add_edge("parse_resume", "parse_jd")

    # Parallel fan-out: every downstream node depends only on the parsed
    # inputs, never on each other's outputs. LangGraph executes all edges
    # out of parse_jd concurrently (super-step semantics).
    workflow.add_edge("parse_jd", "analyze_gap")
    workflow.add_edge("parse_jd", "tailor_resume")
    workflow.add_edge("parse_jd", "generate_cover")
    workflow.add_edge("parse_jd", "predict_questions")
    workflow.add_edge("parse_jd", "check_ats")

    # All branches terminate independently; the API layer assembles
    # PipelineOutput once the graph reaches END on every branch.
    workflow.add_edge("analyze_gap", END)
    workflow.add_edge("tailor_resume", END)
    workflow.add_edge("generate_cover", END)
    workflow.add_edge("predict_questions", END)
    workflow.add_edge("check_ats", END)

    return workflow.compile()

# Global pipeline instance
jobfit_pipeline = create_pipeline_graph()
