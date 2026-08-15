# PRD: AI Job Application Copilot

**Working name:** [TBD — suggestions: Tailr, ApplyFast, JobFit, Resumatch]
**Owner:** Arshvir Singh Kalsi
**Status:** Draft v1
**Date:** August 2026

---

## 1. Problem Statement

Job seekers apply to dozens of roles and are told to "tailor every resume" — but almost nobody does, because it's slow and tedious to rewrite a resume and cover letter for each posting. The result:

- Generic resumes get filtered out by ATS keyword matching before a human ever sees them
- Cover letters get skipped entirely or copy-pasted with the company name swapped
- Candidates walk into interviews unprepared for the specific role, not just "interview prep" in general
- Existing tools (Teal, Simplify, Rezi) either focus on tracking applications, generic resume building, or ATS formatting — few combine JD-specific tailoring + gap analysis + interview prep in one fast, low-friction flow

**Core insight:** The friction isn't "I don't know how to tailor my resume," it's "I don't have 20 minutes to do it for every single application." Speed and low effort are the actual product, not resume quality alone.

---

## 2. Target User

**Primary (v1 focus):** Active job seekers applying to multiple roles per week — new grads, early-to-mid career professionals, and people in active job search (laid off, career switchers). English-language postings first (LinkedIn, Indeed).

**Explicitly not v1:** Recruiters/companies (B2B side), executive-level search (different resume norms), non-English markets.

---

## 3. Core Value Proposition

> "Paste a job link. Get a tailored resume, cover letter, skill-gap list, and likely interview questions in under 30 seconds — without leaving the job posting."

Speed and zero-friction (no manual copy-paste of the JD, works right on the page) is the wedge against slower, form-heavy competitors.

---

## 4. MVP Scope

### 4.1 Inputs
- User's base resume (upload once — PDF/DOCX, parsed and stored)
- Job posting — auto-detected when browsing LinkedIn/Indeed via the Chrome extension, or pasted manually as a URL/text on the web app

### 4.2 What the system does
| Feature | Description | Priority |
|---|---|---|
| JD parsing | Extracts role, required skills, seniority, keywords from the job posting | P0 |
| Resume tailoring | Rewrites bullet points/summary to mirror JD language and prioritize relevant experience, without fabricating experience | P0 |
| Cover letter generation | Short, role-specific cover letter in the user's tone (casual/formal toggle) | P0 |
| Skill-gap flag | Lists 2-4 skills/keywords in the JD the user's resume doesn't cover, with a one-line suggestion (course, project, phrasing fix) | P0 |
| Interview question prediction | 8-10 likely questions based on the specific JD + role type, not generic "tell me about yourself" lists | P1 |
| ATS compatibility check | Flags formatting issues (tables, images, non-standard fonts) that break ATS parsing | P1 |
| Application tracker | Simple table of applications sent, with the tailored resume/letter attached per entry | P2 |
| Multi-resume versions | Save 2-3 base resume variants (e.g., "PM roles" vs "Data roles") to tailor from | P2 |

### 4.3 Explicitly out of scope for MVP
- LinkedIn auto-apply / bot-applying (violates ToS on most platforms, also low trust)
- Video interview practice/mock interviews with AI voice
- Resume design/template builder (assume user already has a formatted base resume)

---

## 5. Tech Architecture (mapped to your stack)

```
Chrome Extension (content script detects JD on LinkedIn/Indeed page)
        │
        ▼
FastAPI backend ── LangGraph pipeline:
   JD parse → resume-gap analysis → tailored resume generation
   → cover letter generation → interview question generation
        │                              │
        ▼                              ▼
Supabase (Postgres) ──          OpenAI/Claude/Gemini API
  user accounts, base resumes,   (generation steps)
  usage limits, application log
        │
        ▼
Resume/cover letter export (PDF generation)
        │
        ▼
Next.js web app (account mgmt, resume upload, history — extension is the primary daily-use surface)
```

**Why this fits your stack:** This is another genuinely multi-step agentic pipeline (parse → analyze → generate → format), which is exactly what LangGraph is for. The Chrome extension is new territory for you but is a well-documented, low-complexity build (content script + API calls).

---

## 6. Monetization

| Tier | Price | What's included |
|---|---|---|
| Free | $0 | 3 tailored applications/month, no interview questions |
| Pro | $12/month | Unlimited tailoring, interview questions, ATS check, multi-resume versions |
| Annual Pro | $89/year (~$7.40/mo) | Same as Pro, discounted for commitment |

**Path to $10k/month:** ~830 Pro subscribers at $12/mo, or a smaller number if annual plans dominate. Given job search is a recurring but time-boxed need (most users churn after they land a job, typically 2-4 months), sustained growth depends on constant new-user acquisition, not just retention — plan content/distribution around that.

---

## 7. Go-to-Market (self-serve, no direct outreach)

1. **Chrome Web Store SEO** — title/description targeting high-intent searches ("resume tailor extension," "AI cover letter LinkedIn," "ATS resume checker")
2. **Short-form content** — job-search content is one of the highest-performing organic niches on TikTok/Instagram Reels/YouTube Shorts; a demo of "watch this rewrite my resume in 20 seconds for this job" is inherently shareable
3. **Product Hunt launch** — job-search/productivity tools do consistently well there
4. **Reddit** — r/jobs, r/resumes, r/cscareerquestions — genuine value-add participation (not spam) builds credibility before any product mention
5. **SEO landing pages** — programmatic pages like "resume for [job title] at [company]" targeting long-tail search intent

---

## 8. Success Metrics (first 90 days)

- 500 free-tier signups by end of Month 1 (extension install + resume upload = activation)
- 5-8% free-to-paid conversion by Month 2
- Weekly active tailoring sessions per paid user ≥ 2 (signals real usage, not one-time trial)
- <15% resume-parsing failure rate (biggest silent killer of trust in this category)

---

## 9. Key Risks

| Risk | Mitigation |
|---|---|
| Resume parsing is unreliable across formats/templates | Invest early in robust PDF/DOCX parsing + a manual "paste text" fallback |
| AI-generated content sounds generic/gets flagged as AI-written by recruiters | Tune prompts hard for natural language, avoid buzzword-stuffing, let users edit before export |
| Crowded competitive space (Teal, Simplify, Rezi, Kickresume) | Win on speed + zero-friction (in-page extension) rather than trying to out-feature them |
| Users churn once they land a job (inherent to the category) | Budget for continuous top-of-funnel acquisition, not just retention; consider a "referral for a free month" loop since job seekers talk to other job seekers |
| Chrome Web Store review/approval delays | Submit early, in parallel with backend build |

---

## 10. Next Steps

1. Build the core pipeline first as a simple web app (paste JD + upload resume → get tailored output) before building the Chrome extension — validates the AI quality without extension review delays
2. Get 10-20 people (LeetCode/hackathon network, college peers actively job hunting) to test it for free and give direct feedback on output quality
3. Once resume-tailoring quality is solid, build the Chrome extension as the primary distribution surface and prep the Product Hunt/content launch