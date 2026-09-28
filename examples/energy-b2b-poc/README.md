# Energy Storage B2B Lead Agent — Portfolio POC

**Status:** portfolio proof, not a prior client deployment.

This branch contains a small, inspectable proof for a buyer asking for an n8n + LangGraph multi-agent B2B lead-acquisition system in energy storage.

## What the demo proves

- **n8n intake + deterministic qualification:** score public company data against an energy-storage ICP.
- **Segmentation:** distributor, system integrator/EPC, renewable-energy buyer, telecom/data-center backup, or general B2B.
- **Research planning:** create a bounded research checklist before outreach.
- **Guardrails:** no purchased lists, no private-personal data, verify company identity, deduplicate by domain, no send action in the demo.
- **LangGraph handoff:** a minimal state graph shows how verified research and decision steps can be separated from n8n orchestration.

## Intended production POC

A production 2–4 week POC would add:

1. Approved public-data sources for company discovery.
2. Company-level enrichment and deduplication.
3. Role discovery for procurement / energy systems / business development.
4. Bounded web research with evidence attached to every lead.
5. LangGraph research agents with deterministic stop conditions.
6. n8n orchestration, queues, retries, logging and human review.
7. Personalized outreach drafts based only on verified public facts.
8. CRM export / handoff after approval.
9. Quality metrics: duplicate rate, qualified-lead rate, evidence completeness, outreach acceptance criteria.

## Files

- `energy-b2b-lead-demo.json` — importable n8n workflow, inactive by default.
- `langgraph_lead_research.py` — side-effect-free LangGraph-style state-machine proof.

## Important boundary

The demo does **not** scrape private data, send messages, buy contact data, or pretend a lead is qualified without evidence. Production credentials and paid data providers are client-owned and only enabled after scope approval.
