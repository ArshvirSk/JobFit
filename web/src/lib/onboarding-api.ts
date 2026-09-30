import { createClient } from "./supabase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export interface UserPreferences {
  target_roles?: string[];
  seniority?: string;
  locations?: string[];
  work_mode?: string;
  target_sectors?: string[];
}

export interface UserConnector {
  id: string;
  provider: string;
  scopes_granted: string[];
  status: string;
  connected_at: string;
  last_synced_at?: string;
}

async function getAuthHeaders() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("No active session");
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${session.access_token}`,
  };
}

export async function completeOnboarding(preferences: UserPreferences, linkedinUrl?: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/api/onboarding/complete`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      preferences,
      linkedin_url: linkedinUrl,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to complete onboarding");
  }
  return res.json();
}

export async function getPreferences() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/api/onboarding/preferences`, {
    headers,
  });
  if (!res.ok) return null;
  return res.json();
}

export async function savePreferences(preferences: UserPreferences) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/api/onboarding/preferences`, {
    method: "PUT",
    headers,
    body: JSON.stringify(preferences)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to save preferences");
  }
  return res.json();
}

export async function getConnectors(): Promise<UserConnector[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/api/connectors`, {
    headers,
  });
  if (!res.ok) return [];
  return res.json();
}

export async function revokeConnector(provider: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/api/connectors/${provider}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to revoke connector");
  }
  return res.json();
}

export async function startOAuthFlow(provider: string) {
  const headers = await getAuthHeaders();
  const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/oauth/callback` : '';
  
  const res = await fetch(`${API_BASE_URL}/api/connectors/oauth/start`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider,
      redirect_uri: redirectUri
    })
  });
  
  if (!res.ok) throw new Error("Failed to start OAuth flow");
  
  const data = await res.json();
  
  // Store provider in localStorage so we know what we were connecting when we return
  if (typeof window !== 'undefined') {
    localStorage.setItem('oauth_provider', provider);
  }
  
  // Redirect user to the OAuth URL
  if (data.url && typeof window !== 'undefined') {
    window.location.href = data.url;
  }
}

export async function completeOAuthFlow(provider: string, code: string, state: string) {
  const headers = await getAuthHeaders();
  const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/oauth/callback` : '';
  
  const res = await fetch(`${API_BASE_URL}/api/connectors/oauth/callback`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider,
      code,
      state,
      redirect_uri: redirectUri
    })
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to complete OAuth flow");
  }
  
  return res.json();
}

export async function uploadLinkedInData(file: File) {
  const headers = await getAuthHeaders();
  // Remove Content-Type header so the browser can set it with the boundary for FormData
  delete headers["Content-Type"];
  
  const formData = new FormData();
  formData.append("file", file);
  
  const res = await fetch(`${API_BASE_URL}/api/connectors/linkedin/upload`, {
    method: "POST",
    headers,
    body: formData
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to upload LinkedIn data");
  }
  
  return res.json();
}
