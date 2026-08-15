import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── JWT Interceptor ─────────────────────────────────────
// Attaches the Supabase access token to every outgoing request.
// The token is read dynamically from the Supabase client on each request.
export function setAuthToken(token: string | null) {
  if (token) {
    apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common["Authorization"];
  }
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

  saveApplication: (company: string, role: string, status: string = "Applied", notes: string = "") =>
    apiClient.post("/api/applications", { company, role, status, notes }),

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
};
