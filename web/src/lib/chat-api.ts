/**
 * Chat API client — thin fetch() wrapper for SSE streaming support.
 *
 * We use raw fetch() instead of axios because axios doesn't support
 * streaming response bodies. The Supabase JWT is attached from the
 * client-side session.
 */

import { createClient } from "@/lib/supabase";
import { extensionToken } from "@/lib/api";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const rawToken = extensionToken || (typeof globalThis !== 'undefined' ? (globalThis as any).__jobfit_ext_token : null);
  const token = (rawToken && rawToken !== "null" && rawToken !== "undefined") ? rawToken : null;
  
  console.log("[AuthDebug] extensionToken var:", !!extensionToken);
  console.log("[AuthDebug] globalThis.__jobfit_ext_token:", !!(typeof globalThis !== 'undefined' ? (globalThis as any).__jobfit_ext_token : null));
  console.log("[AuthDebug] final token:", token ? "Exists" : "NULL");

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  return headers;
}

// ── Types ────────────────────────────────────────────────

export interface ChatThread {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_preview?: string;
  last_message_role?: string | null;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata: {
    detected_entities?: string[] | null;
    response_type?: string | null;
    detection_method?: string | null;
    progress?: string[];
    action_buttons?: ActionButton[] | null;
    action_metadata?: Record<string, unknown> | null;
  };
}

export interface ActionButton {
  label: string;
  action_type: "email_draft" | "open_profile" | "view_project_idea" | "open_tailor";
  payload: Record<string, unknown>;
}

export interface SSEEvent {
  token: string;
  done: boolean;
  progress?: string;
  metadata?: {
    detected_entities?: string[] | null;
    response_type?: string | null;
    detection_method?: string | null;
    action_buttons?: ActionButton[] | null;
    action_metadata?: Record<string, unknown> | null;
  };
  error?: boolean;
}

// ── API Functions ────────────────────────────────────────

export async function fetchThreads(): Promise<ChatThread[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/chat/threads`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch threads: ${res.status}`);
  return res.json();
}

export async function createThread(
  title?: string
): Promise<ChatThread> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/chat/threads`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: title || null }),
  });
  if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);
  return res.json();
}

export async function deleteThread(threadId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/chat/threads/${threadId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`Failed to delete thread: ${res.status}`);
}

export async function fetchMessages(
  threadId: string
): Promise<ChatMessage[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${API_BASE}/api/chat/threads/${threadId}/messages`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
  return res.json();
}

/**
 * Send a message and return a ReadableStream of SSE events.
 *
 * Usage:
 *   const reader = await sendMessage(threadId, content);
 *   for await (const event of reader) {
 *     // event: SSEEvent
 *   }
 */
export async function sendMessage(
  threadId: string,
  content: string
): Promise<ReadableStream<SSEEvent>> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${API_BASE}/api/chat/threads/${threadId}/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ content }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to send message: ${res.status}`);
  }

  if (!res.body) {
    throw new Error("No response body for SSE stream");
  }

  // Transform the raw byte stream into parsed SSE events
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<SSEEvent>({
    async pull(controller) {
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6);
            try {
              const event: SSEEvent = JSON.parse(jsonStr);
              controller.enqueue(event);

              if (event.done) {
                controller.close();
                return;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

/**
 * Helper to consume an SSE stream with a callback.
 */
export async function consumeStream(
  stream: ReadableStream<SSEEvent>,
  onToken: (event: SSEEvent) => void
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onToken(value);
    }
  } finally {
    reader.releaseLock();
  }
}
