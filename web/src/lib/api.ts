import axios from "axios";
import { createClient } from "@/lib/supabase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export let extensionToken: string | null = null;
export function setExtensionAuthToken(token: string) {
  extensionToken = token;
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).__jobfit_ext_token = token;
  }
}

// ── JWT Interceptor ─────────────────────────────────────
apiClient.interceptors.request.use(async (config) => {
  try {
  const rawToken = extensionToken || (typeof globalThis !== 'undefined' ? (globalThis as any).__jobfit_ext_token : null);
  const token = (rawToken && rawToken !== "null" && rawToken !== "undefined") ? rawToken : null;
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  }
  
  const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch {
    // If we can't get the session, proceed without auth header —
    // the backend will return 401, and the frontend auth guard will redirect.
  }
  return config;
});

// ── Legacy setAuthToken (no-op, kept for backwards compat) ──
// The interceptor above handles token injection automatically.
// This function is kept so existing call sites don't break.
export function setAuthToken(_token: string | null) {
  // No-op: the request interceptor handles this dynamically now.
}

// ── Request/Response types ──────────────────────────────

export interface ParseResumeRequest {
  raw_text: string;
}

export interface PipelineInput {
  jd_text?: string;
  jd_url?: string;
  resume_text?: string;
  base_resume_id?: string;
  missing_requirements?: string[];
}

// ── API methods ─────────────────────────────────────────
// No more hardcoded user IDs — the backend reads the user from the JWT.

export const api = {
  healthCheck: () => apiClient.get("/health"),

  parseResumeText: (data: ParseResumeRequest) =>
    apiClient.post("/api/resume/parse-text", data),

  uploadResume: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post("/api/resume/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  extractResumeText: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post("/api/resume/extract-text", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  tailorResume: (data: PipelineInput) =>
    apiClient.post("/api/tailor", data),

  // --- Resumes ---
  getResumes: () =>
    apiClient.get("/api/resume"),

  saveResume: (label: string, raw_text: string) =>
    apiClient.post("/api/resume", { label, raw_text }),

  deleteResume: (resumeId: string) =>
    apiClient.delete(`/api/resume/${resumeId}`),

  reparseResume: (resumeId: string) =>
    apiClient.post(`/api/resume/${resumeId}/reparse`),

  scoreFit: (resumeId: string, jdText: string, extra?: { company?: string, role?: string }) =>
    apiClient.post(`/api/fit-score`, { base_resume_id: resumeId, jd_text: jdText, ...extra }),

  // --- Application Tracker ---
  getApplications: () =>
    apiClient.get("/api/applications"),

  saveApplication: (company: string, role: string, status: string = "Materials Generated", notes: string = "", extra: any = {}) =>
    apiClient.post("/api/applications", { company, role, status, notes, ...extra }),

  updateApplicationStatus: (appId: string, status: string) =>
    apiClient.patch(`/api/applications/${appId}/status`, { status }),

  updateApplication: (appId: string, data: Partial<{company: string, role: string, status: string, notes: string}>) =>
    apiClient.patch(`/api/applications/${appId}`, data),

  deleteApplication: (appId: string) =>
    apiClient.delete(`/api/applications/${appId}`),

  // --- User Profile ---
  getUserProfile: () =>
    apiClient.get("/api/user/me"),

  // --- Billing ---
  createCheckoutSession: (planTier: string) =>
    apiClient.post("/api/billing/checkout", { plan_tier: planTier }),

  // --- Company ---
  getLinkedinConnections: (slug: string) =>
    apiClient.get(`/api/company/${slug}/linkedin_connections`),
    
  generateOutreachDraft: (slug: string, bestFitRole?: string, githubProject?: string) =>
    apiClient.post(`/api/company/${slug}/outreach_draft`, {
      best_fit_role: bestFitRole,
      github_project: githubProject
    }),
    
  addManualContact: (slug: string, data: { name: string, title?: string, note?: string, linkedin_url?: string }) =>
    apiClient.post(`/api/company/${slug}/manual_contacts`, data),
    
  updateManualContact: (slug: string, id: string, data: { name: string, title?: string, note?: string, linkedin_url?: string }) =>
    apiClient.put(`/api/company/${slug}/manual_contacts/${id}`, data),
    
  deleteManualContact: (slug: string, id: string) =>
    apiClient.delete(`/api/company/${slug}/manual_contacts/${id}`),

  getGithubMatch: (slug: string) =>
    apiClient.get(`/api/company/${slug}/github_match`),

  // --- Watch & Notifications ---
  watchCompany: (slug: string) =>
    apiClient.post(`/api/company/${slug}/watch`),
    
  unwatchCompany: (slug: string) =>
    apiClient.delete(`/api/company/${slug}/watch`),
    
  getWatchStatus: (slug: string) =>
    apiClient.get(`/api/company/${slug}/watch`),
    
  getNotifications: () =>
    apiClient.get("/api/company/notifications"),
    
  markNotificationRead: (notifId: string) =>
    apiClient.post(`/api/company/notifications/${notifId}/read`),
    
  // --- Detected Events ---
  getDetectedEvents: () =>
    apiClient.get("/api/detected_events"),
    
  dismissDetectedEvent: (eventId: string) =>
    apiClient.post(`/api/detected_events/${eventId}/dismiss`),
    
  confirmDetectedEvent: (eventId: string) =>
    apiClient.post(`/api/detected_events/${eventId}/confirm`),

  // --- Project Ideas ---
  generateProjectIdea: (slug: string, jobHash: string, data: { skill_gap: string, company_name: string, job_title: string }) =>
    apiClient.post(`/api/company/${slug}/jobs/${jobHash}/project_ideas`, data),
    
  updateProjectIdeaStatus: (slug: string, jobHash: string, ideaId: string, status: string) =>
    apiClient.patch(`/api/company/${slug}/jobs/${jobHash}/project_ideas/${ideaId}/status`, { status }),
};
