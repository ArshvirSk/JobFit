import operator
from typing import TypedDict, Annotated, List, Optional
from langgraph.graph import StateGraph, END
from backend.models.schemas import ParsedJD, ParsedResume, SkillGap, CoverLetter
from backend.pipeline.nodes.parse_jd import parse_jd_node
from backend.pipeline.nodes.parse_resume import parse_resume_node
from backend.pipeline.nodes.analyze_gap import analyze_gap_node
from backend.pipeline.nodes.tailor_resume import tailor_resume_node
from backend.pipeline.nodes.generate_cover import generate_cover_node
from backend.pipeline.nodes.predict_questions import predict_questions_node
from backend.pipeline.nodes.check_ats import check_ats_node

class PipelineState(TypedDict):
    # Inputs
    raw_jd: str
    raw_resume: Optional[str]
    tone: str
    
    # Processed Data
    parsed_jd: Optional[ParsedJD]
    parsed_resume: Optional[ParsedResume]
    
    # Outputs
    tailored_resume: Optional[ParsedResume]
    cover_letter: Optional[CoverLetter]
    skill_gaps: Optional[List[SkillGap]]
    interview_questions: Optional[List[str]]
    ats_issues: Optional[List[str]]
    
    # State tracking
    errors: Annotated[List[str], operator.add]

def create_pipeline_graph() -> StateGraph:
    """Create and compile the LangGraph DAG for the JobFit pipeline."""
    workflow = StateGraph(PipelineState)
    
    # Add nodes
    workflow.add_node("parse_jd", parse_jd_node)
    # Note: parse_resume is usually run separately when the user uploads it. 
    # But if raw_resume is provided, we can parse it here.
    workflow.add_node("parse_resume", parse_resume_node)
    
    workflow.add_node("analyze_gap", analyze_gap_node)
    workflow.add_node("tailor_resume", tailor_resume_node)
    workflow.add_node("generate_cover", generate_cover_node)
    
    # P1 Stubs
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
    
    # After JD is parsed, run gap analysis, tailoring, and ATS check in parallel (if ATS was real)
    # For simplicity, sequential for now.
    workflow.add_edge("parse_jd", "analyze_gap")
    workflow.add_edge("analyze_gap", "tailor_resume")
    workflow.add_edge("tailor_resume", "generate_cover")
    workflow.add_edge("generate_cover", "predict_questions")
    workflow.add_edge("predict_questions", "check_ats")
    workflow.add_edge("check_ats", END)
    
    return workflow.compile()

# Global pipeline instance
jobfit_pipeline = create_pipeline_graph()
