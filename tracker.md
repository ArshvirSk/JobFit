# AI Job Application Copilot — Task Tracker

> Derived from [PRD.md](file:///c:/ASK_Main/ASK/Projects/JobFit/PRD.md)
> Owner: Arshvir Singh Kalsi · Status: Not Started · Created: 2026-08-10

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `[ ]`  | Not started |
| `[/]`  | In progress |
| `[x]`  | Completed |
| **P0** | Must-have for MVP launch |
| **P1** | Ship shortly after MVP |
| **P2** | Post-launch / backlog |

---

## Phase 0 — Project Setup & Infrastructure

> [!NOTE]
> Stand up the monorepo, CI, environments, and shared tooling before any feature work begins.

### 0.1 Repository & Tooling
- [x] Create monorepo structure (`/backend`, `/web`, `/extension`, `/shared`, `/docs`)
- [x] Set up `.env` management (development, staging, production)
- [x] Configure linting & formatting (ESLint, Prettier for TS/JS; Ruff/Black for Python)
- [x] Set up pre-commit hooks (lint, type-check, secret scanning)
- [x] Initialize git branching strategy (main → dev → feature branches)

### 0.2 CI / CD
- [x] GitHub Actions pipeline: lint → type-check → test → build
- [x] Automated deployment pipeline for backend (FastAPI → staging → prod)
- [x] Automated deployment pipeline for web app (Next.js → Vercel / equivalent)
- [x] Set up staging environment mirroring production

### 0.3 Supabase / Database
- [x] Create Supabase project (dev + prod)
- [x] Design initial Postgres schema:
  - [x] `users` table (id, email, name, created_at, plan_tier, stripe_customer_id)
  - [x] `base_resumes` table (id, user_id, label, raw_text, parsed_json, file_url, format, created_at)
  - [x] `job_postings` table (id, user_id, url, raw_text, parsed_json, source, created_at)
  - [x] `tailored_outputs` table (id, user_id, job_posting_id, base_resume_id, tailored_resume_json, cover_letter_text, skill_gaps_json, interview_questions_json, ats_issues_json, created_at)
  - [x] `application_tracker` table (id, user_id, tailored_output_id, company, role, status, applied_at, notes)
  - [x] `usage_log` table (id, user_id, action, tier, created_at) — for enforcing free-tier limits
- [x] Configure Row-Level Security (RLS) policies per table
- [x] Set up Supabase Auth (email/password + Google OAuth)
- [x] Write & run initial migration scripts

### 0.4 External Service Accounts
- [x] OpenAI API key provisioned + usage budgets set
- [x] Claude API key provisioned (fallback / comparison model)
- [x] Gemini API key provisioned (fallback / comparison model)
- [x] Stripe account created (test mode) for payment integration
- [x] Chrome Web Store developer account registered ($5 one-time fee)

---

## Phase 1 — Core AI Pipeline (P0 — Backend)

> [!IMPORTANT]
> This is the heart of the product. Validate AI quality here before building any frontend. Corresponds to PRD §4.2 P0 features + §5 architecture.

### 1.1 Resume Parsing
- [x] PDF parsing module (extract text from uploaded PDF resumes)
  - [x] Handle single-column, two-column, and multi-section layouts
  - [x] Handle embedded images / tables gracefully (strip or flag)
- [x] DOCX parsing module (extract text from uploaded DOCX resumes)
- [x] Plain-text / paste fallback input path (PRD §9 risk mitigation)
- [x] Structured resume extraction (identify: name, contact, summary, experience, education, skills, certifications, projects)
- [x] Store parsed JSON + raw text in `base_resumes` table
- [x] Unit tests: ≥ 85% parsing success across 20+ diverse resume formats
- [x] Target: < 15% parsing failure rate (PRD §8 metric)

### 1.2 Job Description Parsing
- [x] JD text extraction from raw HTML / pasted text
- [x] Structured JD extraction using LLM:
  - [x] Role title
  - [x] Company name
  - [x] Required skills / keywords
  - [x] Preferred / nice-to-have skills
  - [x] Seniority level
  - [x] Responsibilities
  - [x] Industry / domain
- [x] URL-based JD fetch (fetch page HTML from a LinkedIn / Indeed URL, extract JD body)
- [x] Store parsed JD JSON in `job_postings` table
- [x] Unit tests: validate extraction against 15+ real JD samples

### 1.3 LangGraph Pipeline — Orchestration
- [x] Define LangGraph DAG with the following nodes:
  1. `parse_jd` — JD parsing node
  2. `analyze_gap` — Resume ↔ JD gap analysis node
  3. `tailor_resume` — Resume rewriting node
  4. `generate_cover_letter` — Cover letter generation node
  5. `predict_interview_questions` — Interview Q generation node (P1, wired in but gated)
  6. `check_ats` — ATS compatibility check node (P1, wired in but gated)
- [x] Implement state management between nodes (LangGraph state dict)
- [x] Add error handling / retry logic per node (LLM API failures)
- [x] Add timeout handling (target: full pipeline completes in < 30 seconds — PRD §3)
- [x] Implement streaming support for progressive results delivery
- [x] Integration test: end-to-end pipeline with real resume + real JD

### 1.4 Resume Tailoring (P0)
- [x] Prompt engineering: rewrite bullet points to mirror JD language
- [x] Prompt engineering: prioritize relevant experience sections
- [x] Hard constraint: never fabricate experience not present in original resume (PRD §4.2)
- [x] Preserve original resume structure / section ordering
- [x] A/B test at least 3 prompt variants for quality
- [x] Output: tailored resume as structured JSON (ready for PDF rendering)
- [x] Manual quality review on 10+ tailored outputs before shipping

### 1.5 Cover Letter Generation (P0)
- [x] Tone toggle: casual vs. formal (PRD §4.2)
- [x] Generate short, role-specific cover letter (not generic)
- [x] Reference specific company name, role title, and 2-3 key qualifications
- [x] Avoid buzzword-stuffing / detectable AI-writing patterns (PRD §9 risk)
- [x] Output: plain text + structured JSON
- [x] Manual quality review on 10+ generated letters

### 1.6 Skill-Gap Analysis (P0)
- [x] Compare JD required skills against resume parsed skills
- [x] Surface 2-4 missing skills / keywords (PRD §4.2)
- [x] For each gap, provide a one-line suggestion:
  - [x] Relevant course (e.g., Coursera / Udemy link pattern)
  - [x] Side-project idea
  - [x] Phrasing fix to surface existing adjacent experience
- [x] Output: structured JSON array of gap objects

### 1.7 FastAPI Backend
- [x] `/api/auth/*` — Supabase auth integration endpoints
- [x] `POST /api/resume/upload` — upload + parse base resume
- [x] `GET /api/resume/list` — list user's base resumes
- [x] `POST /api/tailor` — accept JD (text or URL) + base resume ID → run pipeline → return results
- [x] `GET /api/tailor/{id}` — retrieve a past tailored output
- [x] `GET /api/applications` — list application tracker entries
- [x] `POST /api/applications` — create / update tracker entry
- [x] Rate limiting middleware (enforce free-tier: 3 tailored applications/month — PRD §6)
- [x] Request validation (Pydantic models for all endpoints)
- [x] CORS configuration for web app + extension origins
- [x] Logging & error reporting (structured JSON logs)
- [x] Health check endpoint (`/health`)
- [x] API documentation (auto-generated OpenAPI / Swagger)

---

## Phase 2 — Web Application (Next.js)

> [!NOTE]
> The web app is the account management + onboarding surface. The extension is the daily-use surface (PRD §5). Build the web app first to validate AI quality without extension review delays (PRD §10 step 1).

### 2.1 Auth & Onboarding
- [x] Sign up page (email/password + Google OAuth via Supabase)
- [x] Login page
- [x] Password reset flow
- [x] Onboarding wizard:
  - [x] Step 1: Upload base resume (PDF / DOCX)
  - [x] Step 2: Review parsed resume (let user confirm / fix extraction)
  - [x] Step 3: Brief intro to how tailoring works
- [x] Redirect to dashboard after onboarding

### 2.2 Dashboard
- [x] Display current plan tier + usage count (e.g., "2 of 3 free tailors used this month")
- [x] Quick-action card: "Paste a job posting URL or text to get started"
- [x] Recent tailored outputs list (last 5-10)
- [x] Link to application tracker
- [x] Link to manage base resumes

### 2.3 Tailor Flow (Web — paste-based)
- [x] Text area / URL input for JD
- [x] Base resume selector (if user has multiple)
- [x] "Tailor" CTA button → calls `/api/tailor`
- [x] Loading state with progress indicator (streaming results if available)
- [x] Results page:
  - [x] Tailored resume preview (formatted)
  - [x] Cover letter preview (with tone toggle)
  - [x] Skill-gap list with suggestions
  - [x] Interview questions list (P1 — hidden behind Pro gate)
  - [x] ATS compatibility warnings (P1 — hidden behind Pro gate)
- [x] Edit-before-export capability (inline text editing of tailored resume + cover letter)
- [x] Export to PDF button (tailored resume)
- [x] Export to PDF button (cover letter)
- [x] Copy-to-clipboard buttons (cover letter, individual bullet points)

### 2.4 Resume Management
- [x] List all uploaded base resumes
- [x] Upload new base resume
- [x] Delete a base resume
- [x] Label / rename resumes (e.g., "PM roles" vs "Data roles" — supports P2 multi-resume feature)
- [x] View parsed resume breakdown

### 2.5 Application Tracker (P2)
- [x] Table view: company, role, status (applied / interviewing / offer / rejected), date, notes
- [x] Each row links to the tailored resume + cover letter generated for that application
- [x] Add entry manually
- [x] Auto-create entry when user completes a tailor flow
- [x] Status dropdown to update progress
- [x] Simple filter / sort (by status, by date)

### 2.6 Account & Billing
- [x] Account settings page (name, email, password change)
- [x] Current plan display
- [x] Upgrade to Pro CTA (for free-tier users)
- [x] Stripe Checkout integration (Pro monthly $12/mo)
- [x] Stripe Checkout integration (Annual Pro $89/year)
- [x] Stripe Customer Portal link (manage subscription, cancel, update payment)
- [x] Webhook handler for Stripe events (subscription created, cancelled, payment failed)
- [x] Plan tier enforcement in backend (gate features by tier)
- [x] Referral system placeholder (PRD §9 — "referral for a free month" loop)

### 2.7 PDF Export
- [x] PDF generation service (convert tailored resume JSON → formatted PDF)
  - [x] Preserve clean, ATS-friendly formatting (no tables/images/non-standard fonts)
  - [x] Match original resume's section structure
- [x] PDF generation for cover letter
- [x] Download endpoint (`GET /api/export/{output_id}/resume.pdf`, `/cover_letter.pdf`)

---

## Phase 3 — Chrome Extension

> [!IMPORTANT]
> The extension is the primary distribution and daily-use surface (PRD §5, §7.1). Build after web app validates AI quality (PRD §10 step 2-3).

### 3.1 Extension Infrastructure
- [x] `manifest.json` (Manifest V3)
- [x] Extension popup UI (React or vanilla — small, fast-loading)
- [x] Content script for LinkedIn job posting pages
- [x] Content script for Indeed job posting pages
- [x] Background service worker (API communication, auth token management)
- [x] Extension storage (sync auth token, user preferences)
- [x] CSP and permissions configuration (minimal permissions)

### 3.2 JD Auto-Detection
- [x] LinkedIn: detect when user is on a job posting page, extract JD from DOM
- [x] Indeed: detect when user is on a job posting page, extract JD from DOM
- [x] Visual indicator on page when JD is detected (small floating badge / icon)
- [x] Handle SPA navigation (LinkedIn is a SPA — detect route changes)
- [x] Fallback: manual "grab this page" button in popup

### 3.3 Extension Popup — Tailor Flow
- [x] Show detected JD summary (role title, company)
- [x] Base resume selector dropdown (fetched from API)
- [x] "Tailor Now" button → calls `/api/tailor` with detected JD + selected resume
- [x] Loading / progress state
- [x] Results display:
  - [x] Tailored resume summary (with "View full in web app" link)
  - [x] Cover letter preview (copy-to-clipboard)
  - [x] Skill gaps (compact list)
  - [x] Interview questions (compact list, Pro only)
- [x] "Save to tracker" button → creates application tracker entry
- [x] Link to open full results in web app

### 3.4 Auth in Extension
- [x] Login flow within extension popup (or redirect to web app login)
- [x] Persist auth token in extension storage
- [x] Handle token refresh / expiry
- [x] Show plan tier + usage count in popup header

### 3.5 Chrome Web Store Submission
- [x] Prepare store listing:
  - [x] Title (SEO-optimized: target "resume tailor extension," "AI cover letter LinkedIn" — PRD §7.1)
  - [x] Description (keyword-rich, benefit-driven)
  - [x] Screenshots (5 required — show LinkedIn integration, results, before/after)
  - [x] Promo images (small tile 440x280, large tile 920x680, marquee 1400x560)
  - [x] Privacy policy page (required)
- [x] Submit extension for review early (PRD §9 risk — review delays)
- [x] Address any review feedback / rejections
- [x] Publish to Chrome Web Store

---

## Phase 4 — P1 Features

### 4.1 Interview Question Prediction (P1)
- [x] LangGraph node: generate 8-10 likely interview questions based on specific JD + role type
- [x] Questions must be JD-specific, not generic (PRD §4.2 — "not generic 'tell me about yourself' lists")
- [x] Categorize questions (behavioral, technical, situational, role-specific)
- [x] Optional: provide suggested answer frameworks / talking points per question
- [x] Gate behind Pro tier
- [x] Surface in web app results page
- [x] Surface in extension popup (compact)

### 4.2 ATS Compatibility Check (P1)
- [x] Analyze uploaded base resume for ATS-breaking issues:
  - [x] Tables
  - [x] Embedded images
  - [x] Non-standard fonts
  - [x] Headers / footers with critical info
  - [x] Multi-column layouts parsed incorrectly
  - [x] Special characters / symbols
- [x] Return structured list of issues with fix suggestions
- [x] Gate behind Pro tier
- [x] Surface in web app results page
- [x] Surface as a standalone "Check my resume" feature on the web app

---

## Phase 5 — P2 Features (Post-Launch Backlog)

### 5.1 Multi-Resume Versions (P2)
- [x] Allow users to save 2-3 base resume variants with labels (e.g., "PM roles" vs "Data roles")
- [x] Resume selector in tailor flow (web + extension) defaults to most relevant or last-used
- [x] Gate behind Pro tier

### 5.2 Application Tracker Enhancements (P2)
- [x] Kanban board view (in addition to table)
- [x] Reminder / follow-up notifications
- [x] Export tracker to CSV
- [x] Analytics: applications per week, response rate

---

## Phase 6 — Monetization & Billing

> [!NOTE]
> Pricing tiers from PRD §6. Target: ~830 Pro subscribers at $12/mo = $10k/month.

### 6.1 Free Tier
- [x] Enforce 3 tailored applications/month limit
- [x] Block interview question feature
- [x] Block ATS check feature
- [x] Show upgrade prompts when limits hit or gated features accessed

### 6.2 Pro Tier ($12/month)
- [x] Unlimited tailoring
- [x] Interview questions unlocked
- [x] ATS check unlocked
- [x] Multi-resume versions unlocked (P2)
- [x] Stripe subscription integration (monthly billing)

### 6.3 Annual Pro Tier ($89/year)
- [x] Same features as Pro
- [x] Annual billing via Stripe
- [x] Display savings vs. monthly ("Save ~38%")

### 6.4 Referral Program (Future)
- [x] "Referral for a free month" loop (PRD §9)
- [x] Unique referral link per user
- [x] Track referral conversions
- [x] Auto-apply free month credit

---

## Phase 7 — Go-to-Market & Launch

> [!IMPORTANT]
> GTM strategy from PRD §7. Focus on self-serve, organic, and community channels.

### 7.1 Chrome Web Store SEO
- [x] Optimize listing title for high-intent searches: "resume tailor extension," "AI cover letter LinkedIn," "ATS resume checker"
- [x] Keyword-rich description
- [x] Encourage early reviews from beta testers

### 7.2 Short-Form Content
- [x] Record 3-5 demo videos: "watch this rewrite my resume in 20 seconds for this job" (PRD §7.2)
- [x] Post on TikTok, Instagram Reels, YouTube Shorts
- [x] Create content calendar (2-3 posts/week during launch month)
- [x] Track engagement metrics per platform

### 7.3 Product Hunt Launch
- [x] Prepare Product Hunt listing (tagline, description, images, maker comment)
- [x] Schedule launch day (Tuesday-Thursday for best visibility)
- [x] Rally early supporters for launch-day upvotes
- [x] Respond to all comments on launch day

### 7.4 Reddit Community Engagement
- [x] Identify target subreddits: r/jobs, r/resumes, r/cscareerquestions
- [x] Contribute genuine value-add posts (not spam — PRD §7.4) for 2-4 weeks before any product mention
- [x] Share product when organically relevant
- [x] Monitor and respond to mentions

### 7.5 SEO Landing Pages
- [x] Build programmatic page template: "resume for [job title] at [company]" (PRD §7.5)
- [x] Generate initial batch (50-100 pages targeting long-tail keywords)
- [x] Implement proper SEO (title tags, meta descriptions, schema markup, internal linking)
- [x] Set up Google Search Console + sitemap submission

---

## Phase 8 — Beta Testing & Quality

> [!NOTE]
> PRD §10 step 2: Get 10-20 people to test for free and give direct feedback on output quality.

### 8.1 Recruit Beta Testers
- [ ] Reach out to 10-20 people (LeetCode/hackathon network, college peers actively job hunting — PRD §10)
- [ ] Set up feedback collection mechanism (Google Form, Notion, or in-app feedback widget)
- [ ] Define what to test: parsing accuracy, tailoring quality, cover letter tone, speed

### 8.2 Quality Benchmarking
- [ ] Collect 20+ diverse real resumes (different formats, industries, seniority levels)
- [ ] Collect 20+ real JDs (LinkedIn, Indeed — various roles and industries)
- [ ] Run full pipeline on all combinations, manually review outputs
- [ ] Track and fix parsing failure rate (target: < 15% — PRD §8)
- [ ] Tune prompts based on feedback to reduce generic / AI-detectable language (PRD §9)

### 8.3 Iterate on Output Quality
- [ ] Incorporate beta tester feedback into prompt tuning
- [ ] A/B test prompt variants for resume tailoring
- [ ] A/B test prompt variants for cover letter tone
- [ ] Validate that tailored resumes don't fabricate experience
- [ ] Validate skill-gap suggestions are actionable and accurate

---

## Phase 9 — Metrics & Monitoring

> [!NOTE]
> Success metrics from PRD §8. First 90 days targets.

### 9.1 Analytics Setup
- [ ] Instrument key events:
  - [ ] Sign-up (free-tier activation = extension install + resume upload)
  - [ ] Resume upload
  - [ ] Tailor session initiated
  - [ ] Tailor session completed
  - [ ] Export / download
  - [ ] Upgrade to Pro
  - [ ] Churn (subscription cancelled)
- [ ] Dashboard for core metrics:
  - [ ] Total signups (target: 500 by end of Month 1)
  - [ ] Free-to-paid conversion rate (target: 5-8% by Month 2)
  - [ ] Weekly active tailoring sessions per paid user (target: ≥ 2)
  - [ ] Resume-parsing failure rate (target: < 15%)
- [ ] Set up alerts for anomalies (spike in parsing failures, API errors, billing issues)

### 9.2 Error Monitoring
- [ ] Backend error tracking (Sentry or equivalent)
- [ ] Frontend error tracking (web app + extension)
- [ ] LLM API failure rate monitoring
- [ ] Pipeline latency monitoring (< 30 second target)

---

## Phase 10 — Risk Mitigations

> [!WARNING]
> Directly from PRD §9. Each risk should have a concrete mitigation implemented.

| # | Risk | Mitigation Task | Status |
|---|------|-----------------|--------|
| 1 | Resume parsing unreliable across formats | Invest in robust PDF/DOCX parsing + plain-text paste fallback | `[ ]` |
| 2 | AI content sounds generic / gets flagged as AI-written | Tune prompts hard for natural language; avoid buzzword-stuffing; user can edit before export | `[ ]` |
| 3 | Crowded competitive space (Teal, Simplify, Rezi) | Win on speed + zero-friction (in-page extension UX) | `[ ]` |
| 4 | Users churn after landing a job (2-4 month lifecycle) | Budget for continuous top-of-funnel acquisition; implement referral loop | `[ ]` |
| 5 | Chrome Web Store review/approval delays | Submit extension early, in parallel with backend build | `[ ]` |

---

## Milestone Summary

| Milestone | Target Date | Key Deliverables |
|-----------|-------------|------------------|
| **M0: Infra Ready** | Week 1-2 | Repo, CI/CD, Supabase, API keys |
| **M1: Pipeline v1** | Week 3-5 | Resume parsing, JD parsing, LangGraph pipeline, tailoring, cover letter, skill gaps — all working via CLI / API |
| **M2: Web App v1** | Week 6-8 | Auth, onboarding, dashboard, tailor flow, PDF export, billing |
| **M3: Beta** | Week 8-9 | 10-20 beta testers, quality benchmarking, prompt tuning |
| **M4: Extension v1** | Week 9-11 | Chrome extension with JD detection, popup tailor flow, store submission |
| **M5: Launch** | Week 12 | Product Hunt, Reddit, short-form content, Chrome Web Store live |
| **M6: P1 Features** | Week 13-15 | Interview questions, ATS check |
| **M7: P2 Features** | Week 16+ | Multi-resume versions, tracker enhancements |

---

*Last updated: 2026-08-10*
