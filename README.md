# JobFit: AI Job Application Copilot

JobFit is a full-stack AI-powered application designed to help job seekers instantly tailor their resumes and cover letters for specific job descriptions. It integrates seamlessly with popular job boards like LinkedIn and Indeed via a Chrome Extension.

## 🚀 Features

- **Chrome Extension:** Sits on job boards (LinkedIn, Indeed) and allows 1-click resume tailoring directly from the job posting.
- **Web Application:** A central dashboard to manage base resumes, view tailored documents, and manage billing.
- **AI-Powered Tailoring Engine:** Uses Google Gemini to rewrite resumes and generate cover letters, optimizing for ATS keywords while preserving the user's authentic experience without hallucinating skills.
- **Auth & Database:** Integrated with Supabase Auth (JWTs) and PostgreSQL (with Row-Level Security).
- **Billing Flow:** Enforces a multi-tier SaaS model (Free, Pro) with usage limits, powered by Stripe Checkout and Webhooks.
- **Programmatic SEO:** Auto-generated landing pages targeting long-tail job keywords to drive organic traffic.

## 🛠 Tech Stack

### Frontend (Web App & Extension UI)
- **Framework:** [Next.js 14](https://nextjs.org/) (App Router) / React
- **Styling:** Tailwind CSS, Radix UI, Shadcn UI
- **Language:** TypeScript
- **Extension Build:** Vite + CRXJS

### Backend (API & AI Pipeline)
- **Framework:** [FastAPI](https://fastapi.tiangolo.com/) (Python)
- **AI/LLM SDK:** `google-genai` (Gemini 2.0 Flash)
- **Agent Orchestration:** LangGraph (Stateful pipeline for processing the resume + job description)
- **Database & Auth:** Supabase Python SDK
- **Billing:** Stripe Python SDK
- **Dependency Management:** `uv`

## 🏗 Architecture

The system consists of three main components communicating with each other:

1. **Extension:** Injected into LinkedIn/Indeed. Scrapes the Job Description, reads the Base Resume from the local state/API, and sends it to the Backend.
2. **Backend API:** Receives the JD and Base Resume. Runs it through a LangGraph pipeline that extracts ATS keywords, formats the resume to match the JD, and generates a tailored cover letter.
3. **Web Dashboard:** The portal for users to upload their base resume, view generated documents, and manage their subscription.

## ⚙️ Local Development Setup

### Prerequisites
- Node.js (v18+)
- Python (3.11+)
- `uv` package manager
- Stripe CLI

### 1. Clone the repository
```bash
git clone <repo-url>
cd JobFit
```

### 2. Environment Variables
Copy the example environment file and add your API keys:
```bash
cp .env.example .env
```
Open `.env` and configure your keys for **Gemini, Supabase, and Stripe**.

### 3. Start the Backend (FastAPI)
Using `uv`, the dependencies will be automatically managed in the `.venv` folder.
```bash
# From the root directory
uv run uvicorn backend.main:app --reload
```
The backend will run on `http://localhost:8000`.

### 4. Start the Web App (Next.js)
```bash
cd web
npm install
npm run dev
```
The web app will run on `http://localhost:3000`.

### 5. Listen for Stripe Webhooks
To test the payment flow locally, you must forward Stripe events to your local backend using the Stripe CLI:
```bash
stripe listen --forward-to http://localhost:8000/api/billing/webhook
```

### 6. Build and Load the Chrome Extension
```bash
cd extension
npm install
npm run build
```
To load the extension into Chrome:
1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select the `JobFit/extension/dist` folder.

## 🧪 Testing the Pipeline
Once the extension is loaded and both servers are running:
1. Open a job posting on LinkedIn.
2. Click the JobFit extension icon.
3. Follow the authentication flow and hit "Tailor Resume".
4. The extension will communicate with your local backend to generate the tailored documents!

## 💬 Chat Interface (Phase 1 — Stubbed)

A Happenstance-style conversational interface at `/chat` for company research and career Q&A. Phase 1 uses mocked company data; real connectors will be wired in Phase 2.

### Running the Chat Migration
Before using the chat feature, run the SQL migration in the **Supabase SQL Editor**:
```
File: backend/migrations/chat_migration.sql
```
This creates `chat_threads` and `chat_messages` tables with RLS policies.

### Entity Detection Heuristic

The current entity detection (`backend/chat/entity_detector.py`) uses a **simple regex/keyword-list approach**:

1. **Curated list** (~60 companies): A hardcoded dictionary of well-known company names and aliases (e.g. "byju's", "byjus", "byju" all map to "BYJU'S"). Matches are case-insensitive with word-boundary regex.
2. **Capitalized phrase fallback**: If no curated match is found, looks for capitalized multi-word phrases that aren't common English words (e.g. "Acme Corp") and treats them as possible entities.

**To replace in Phase 2**: Swap the body of `detect_entity()` in `entity_detector.py` with a real NER model or LLM classifier call. Keep the return type as `EntityDetectionResult`. The routing logic in `graph.py` will not need to change.

**Known gaps** (intentional for Phase 1):
- No multi-entity disambiguation ("did you mean X or Y")
- Single-word uncurated entities may not be detected (e.g. "Notion")
- No acronym expansion (e.g. "FAANG" won't trigger individual companies)

### Message Metadata
Every assistant message stores metadata in the `chat_messages.metadata` JSONB column:
```json
{
  "detected_entity": "Razorpay",       // or null
  "response_type": "company_stub",     // or "generic"
  "detection_method": "curated_list"   // or "capitalized_phrase" or "none"
}
```
This enables Phase 3's company SPA to link back to the triggering message without schema migration.

## 🛣 Roadmap
Check out the [tracker.md](./tracker.md) and [PRD.md](./PRD.md) files for detailed breakdown of completed and upcoming phases. Next up is Beta Testing, Quality Benchmarking, and Analytics integration.

---
*Built with ❤️ for job seekers.*
