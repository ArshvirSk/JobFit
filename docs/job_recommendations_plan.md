# Feature Specification: Job Recommendations

## Overview
The Job Recommendations feature aims to provide users with a curated list of job postings tailored to their profile (based on their "Base Resume"). This creates a seamless "discovery-to-application" funnel within JobFit, allowing users to find jobs and instantly tailor their resumes for them in one click.

## Core User Flow
1. User navigates to the **Job Matches** page from the dashboard sidebar.
2. The page displays a loading skeleton while fetching jobs.
3. A grid of job cards is displayed, sorted by **Match Score** (highest to lowest).
4. Each job card displays:
   - Job Title
   - Company Name
   - Location (Remote, City, etc.)
   - Match Score (e.g., 92% Match)
   - Snippet of the job description or key required skills.
5. User clicks the **"Tailor Application"** button on a specific job card.
6. User is redirected to the `/tailor` route.
7. The Tailor form is **automatically pre-filled** with the selected Job Title, Company, and full Job Description.

## Architecture & Implementation Details

### 1. Data Sourcing (External API vs. Mock)
**Decision needed**: Choose a data provider for live job postings.
- **Option A (MVP/Mock)**: Create a mock database or generate realistic dummy job postings using LLMs on the backend. This is the fastest way to build the UI and test the user flow.
- **Option B (Adzuna / Jooble API)**: Use an established job board API. The backend will need to extract the user's core skills/title from their base resume and use those as query parameters for the API.
- **Option C (Scraping)**: Use a third-party RapidAPI service to scrape LinkedIn/Indeed jobs based on keywords.

### 2. Backend Implementation (FastAPI)

#### New Endpoint: `GET /api/jobs/recommendations`
- **Authentication**: Requires a valid user session.
- **Process**:
  1. **Fetch Profile**: Retrieve the user's most recent or "default" base resume from the Supabase `resumes` table.
  2. **Keyword Extraction**: If not already cached, run a lightweight LLM prompt to extract the top 3-5 skills and desired job titles from the resume.
  3. **Job Search**: Query the chosen Data Source (API/Mock) using the extracted keywords.
  4. **Scoring Engine**: 
     - *Basic*: Randomize a score between 70-98 for the MVP.
     - *Advanced*: Pass the top 10 job descriptions back to the LLM (or a faster embedding similarity search) to compare against the base resume and generate a realistic 0-100 `match_score`.
  5. **Response**: Return a JSON array of `JobRecommendation` objects.

#### Data Models
```python
class JobRecommendation(BaseModel):
    id: str
    title: str
    company: str
    location: str
    description_snippet: str
    full_description: str
    url: str
    match_score: int
    posted_at: datetime
```

### 3. Frontend Implementation (Next.js)

#### Navigation Update
- Modify `src/app/(dashboard)/layout.tsx` to include a new sidebar link:
  `{ name: "Job Matches", href: "/matches", icon: Sparkles }`

#### New Page: `/matches`
- Create `src/app/(dashboard)/matches/page.tsx`.
- Use a `useEffect` or `useQuery` (if using React Query) to fetch from `/api/jobs/recommendations`.
- Implement a responsive CSS Grid for the job cards.
- Design a visual indicator for the Match Score (e.g., a circular progress ring or colored badge).

#### Deep Linking to Tailor Page
- Update `src/app/(dashboard)/tailor/page.tsx` to read URL query parameters on mount.
- If `?jobTitle=...&jd=...` is present in the URL, automatically set the state of the form fields.
- **Alternatively**: Use a React Context or Zustand store to hold a `selectedJob` object, which avoids massive URL strings if the Job Description is very long.

## Future Enhancements
- **Swipe Interface**: A Tinder-like UI for saving/dismissing jobs.
- **Email Alerts**: Weekly "Top Matches" email digest.
- **Saved Jobs**: Allow users to save jobs to their "App Tracker" without immediately tailoring a resume.
