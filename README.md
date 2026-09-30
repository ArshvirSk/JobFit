# JobFit — AI Job Application Copilot

Tailored resumes, cover letters, skill-gap analysis, and predicted interview questions — generated from your base resume and any job description, in seconds. Ships as a Chrome extension for LinkedIn/Indeed, a Next.js web dashboard, and a FastAPI AI backend.

**Python · FastAPI · LangGraph · Gemini (structured output) · Supabase · Stripe**

---

## What it does

1. **Capture** — the Chrome extension ("JobFit Copilot") runs on LinkedIn/Indeed job pages, scrapes the JD, and sends it with your base resume to the backend.
2. **Tailor** — a LangGraph pipeline parses the JD and resume, analyzes skill gaps, rewrites the resume for the role (without inventing anything), generates a matching cover letter, predicts likely interview questions, and runs an ATS-compatibility check.
3. **Review** — the web dashboard lets you manage base resumes, review generated documents, chat with a company-intelligence assistant, and manage billing.

## Architecture

```text
Chrome Extension (Vite + CRXJS)
        │  JD text + base resume
        ▼
FastAPI Backend ──── LangGraph tailoring DAG ──── Gemini 2.0 Flash
        │               parse_resume → parse_jd            (structured JSON
        │                    │ (parallel fan-out)           output against
        │               ┌────┬────────┬─────────┬────────┐ Pydantic schemas,
        │               ▼    ▼        ▼         ▼        ▼ with model
        │          gap   tailor  cover    questions   ATS  fallback)
        │          analysis       letter
        │
        ├── LangGraph chat agent (intent routing → connectors → synthesis)
        ├── Supabase (Postgres + RLS, Auth, storage)
        └── Stripe (checkout + webhooks, Free/Pro tiers)
```

**Pipeline details** ([`backend/pipeline/graph.py`](backend/pipeline/graph.py)):
- Conditional entry: resumes uploaded earlier are reused as parsed state; raw text triggers in-graph parsing.
- **Parallel fan-out** after JD parsing — gap analysis, tailoring, cover letter, interview questions, and ATS check are independent nodes and execute concurrently.
- Every LLM call goes through [`backend/services/llm.py`](backend/services/llm.py): JSON-mode generation constrained by a Pydantic `response_schema`, per-attempt **fallback model** (`LLM_FALLBACK_MODEL`, default `gemini-2.0-flash-lite`), and retry pairs.

**The no-fabrication contract** is the core design constraint — a resume tool must never invent experience. It is enforced in layers:
1. System-prompt rules ([`backend/pipeline/prompts/tailor.py`](backend/pipeline/prompts/tailor.py)) — only information from the input resume; reordering/rephrasing allowed; structure must be preserved; standard terminology surfacing (e.g. MLflow → "experiment tracking") is allowed, tool invention is not.
2. Schema-constrained outputs — every node returns typed Pydantic models, never raw strings.
3. **Automated evaluation** (below).

## Evaluation

The tailoring pipeline has a deterministic eval harness ([`tests/eval_metrics.py`](tests/eval_metrics.py), [`tests/golden/resume_jd_pairs.json`](tests/golden/resume_jd_pairs.json)) measuring:

| Metric | What it catches |
|---|---|
| **Entity faithfulness** | Any skill/employer/institution in the output that doesn't exist in the input (fabrication) |
| **JD keyword coverage** | Required skills + JD keywords missing from the tailored resume (ATS alignment) |
| **Structure preservation** | Added/merged/dropped experience entries, padded or deleted bullets |

Golden-set results (`python -m tests.eval_report`):

| case | faithfulness | structure | coverage | latency |
|------|-------------|-----------|----------|---------|
| gold-001 (strong overlap) | 1.000 | 1.000 | 0.818 | ~21s |
| gold-002 (mismatch — honesty case) | 1.000 | 1.000 | 0.111 (expected low) | ~18s |
| gold-003 (ML overlap) | 1.000 | 1.000 | 0.800 | ~20s |

Notes:
- gold-002 pairs a frontend resume with a data-engineering JD. The correct behavior is **faithfulness = 1.0 with low coverage** — the model must reframe honestly instead of keyword-stuffing. The golden set encodes this via `expected_coverage_pass: false`.
- The harness is deliberately heuristic and reference-based (no LLM judge): cheap, deterministic, CI-friendly, and strong against the worst failure mode (fabrication).
- 12 offline unit tests pin the metrics themselves (a fabricating output must fail; an honest one must pass) — run with `pytest -m "not live"`. The `live` marker runs the real pipeline against the golden set (requires `GOOGLE_API_KEY`).

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11, FastAPI, Pydantic v2, uv |
| AI orchestration | LangGraph (two state machines: tailoring DAG + chat agent) |
| LLM | Google Gemini 2.0 Flash via `google-genai` (structured output, search grounding, fallback model) |
| Database & Auth | Supabase (Postgres + Row-Level Security, JWT auth) |
| Payments | Stripe Checkout + webhooks (Free / Pro tiers) |
| Web | Next.js 14 (App Router), TypeScript, Tailwind, Radix/shadcn |
| Extension | Vite + CRXJS (Manifest V3) |
| Quality | pytest (13 offline tests + live eval), ruff |

## Local development

### Prerequisites
- Node.js 18+ / Python 3.11+ / [uv](https://docs.astral.sh/uv/)
- A Google AI Studio API key ([get one here](https://aistudio.google.com/apikey))

### 1. Backend

```bash
cp .env.example .env          # fill in GOOGLE_API_KEY (+ Supabase/Stripe keys as needed)
uv sync --extra dev
uv run uvicorn backend.main:app --reload
```

The API serves on `http://localhost:8000` (`/health` for a smoke check).

### 2. Web dashboard

```bash
cd web
npm install
cp .env.local.example .env.local   # if present; otherwise see web/README
npm run dev
```

### 3. Chrome extension

```bash
cd extension
npm install
npm run build
# Chrome → chrome://extensions → Developer mode → "Load unpacked" → select extension/dist
```

### 4. Run the evaluation harness

```bash
uv run pytest -m "not live"        # offline metric tests (no API needed)
uv run --extra dev python -m tests.eval_report   # live golden-set eval (needs GOOGLE_API_KEY)
```

## Repository layout

```text
backend/
  api/            # REST routes (pipeline, chat, onboarding, actions)
  chat/           # LangGraph chat agent: intent routing, connectors, synthesis
  pipeline/       # LangGraph tailoring DAG: nodes + prompts
  parsers/        # PDF/DOCX/LinkedIn extraction
  services/       # LLM service, Supabase, Stripe, OAuth, encryption, sync
  models/         # Pydantic schemas (the contract between every node)
  migrations/     # Supabase SQL migrations
tests/
  eval_metrics.py # Deterministic eval metrics (faithfulness, coverage, structure)
  golden/         # Golden-set resume/JD pairs
  eval_report.py  # Live eval report runner
web/              # Next.js dashboard
extension/        # Chrome extension
docs/             # Additional documentation
```

## Status & honest limitations

- **Working:** end-to-end tailoring pipeline (extension → API → LangGraph → dashboard), chat agent with company intelligence, auth + billing flow, evaluation harness.
- **Known gaps:** single LLM provider (Gemini) — the fallback is a second Gemini model, not a cross-provider switch; JD parsing quality depends on the source page's markup; the ATS check is heuristic; web tests are manual.

## License

MIT
