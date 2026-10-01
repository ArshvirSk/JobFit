"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";
import { EmptyState } from "./empty-state";
import type { TraceStep } from "./thinking-trace";

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
  metadata?: any;
  trace?: TraceStep[];
}

interface MessageListProps {
  messages: DisplayMessage[];
  isStreaming: boolean;
  isLoading: boolean;
  onSuggestionClick: (text: string) => void;
  onOpenProfile?: (slug: string) => void;
  onRetry?: (messageId: string) => void;
  onDraftFollowUp?: (payload: { company: string; role: string; application_id?: string; days_since?: number }) => void;
  onTailor?: (url: string, gaps?: string[]) => void;
}

export function MessageList({
  messages,
  isStreaming,
  isLoading,
  onSuggestionClick,
  onOpenProfile,
  onRetry,
  onDraftFollowUp,
  onTailor,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or during streaming
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading messages...</span>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className="flex flex-col py-6">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            isStreaming={msg.isStreaming}
            isError={msg.isError}
            metadata={msg.metadata}
            trace={msg.trace}
            onOpenProfile={onOpenProfile}
            onRetry={onRetry && msg.isError ? () => onRetry(msg.id) : undefined}
            onDraftFollowUp={onDraftFollowUp}
            onTailor={onTailor}
          />
        ))}

        {/* Show typing indicator when waiting for pipeline (before first token) */}
        {isStreaming &&
          messages.length > 0 &&
          messages[messages.length - 1].role === "user" && (
            <TypingIndicator />
          )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
