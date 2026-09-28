"""
Portfolio demo: bounded LangGraph-style lead research state machine.
Not a production deployment and does not contact prospects.
"""

from __future__ import annotations
from typing import TypedDict, Literal, List

try:
    from langgraph.graph import StateGraph, END
except ImportError:
    StateGraph = None
    END = "__END__"


class LeadState(TypedDict, total=False):
    company_name: str
    domain: str
    country: str
    fit_score: int
    qualification: Literal["QUALIFIED", "REVIEW", "LOW_FIT"]
    evidence: List[str]
    outreach_angle: str
    next_action: str


def verify_identity(state: LeadState) -> LeadState:
    # Production implementation would call a bounded public-web research tool.
    # Demo stays side-effect free.
    domain = (state.get("domain") or "").strip().lower()
    evidence = list(state.get("evidence") or [])
    if domain:
        evidence.append(f"official-domain-candidate:{domain}")
    return {**state, "evidence": evidence}


def decide(state: LeadState) -> LeadState:
    score = int(state.get("fit_score") or 0)
    if score >= 45:
        action = "PREPARE_RESEARCH_BRIEF"
    elif score >= 25:
        action = "HUMAN_REVIEW"
    else:
        action = "DROP"
    return {**state, "next_action": action}


def build_graph():
    if StateGraph is None:
        raise RuntimeError("Install langgraph to compile this demo graph")
    g = StateGraph(LeadState)
    g.add_node("verify_identity", verify_identity)
    g.add_node("decide", decide)
    g.set_entry_point("verify_identity")
    g.add_edge("verify_identity", "decide")
    g.add_edge("decide", END)
    return g.compile()


if __name__ == "__main__":
    print("Portfolio demo module. Import build_graph() in a LangGraph environment.")
