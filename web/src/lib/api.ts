import axios from "axios";
import { createClient } from "@/lib/supabase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── JWT Interceptor ─────────────────────────────────────
// Dynamically attaches the Supabase access token to every outgoing request.
// This eliminates the race condition where child components fire API calls
// before the layout's useEffect has synced the token.
apiClient.interceptors.request.use(async (config) => {
  try {
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
};
