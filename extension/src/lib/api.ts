import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface ParseResumeRequest {
  raw_text: string;
}

export interface PipelineInput {
  jd_text?: string;
  jd_url?: string;
  resume_text?: string;
  base_resume_id?: string;
}

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
  
  tailorResume: (data: PipelineInput) => 
    apiClient.post("/api/tailor", data),
};
