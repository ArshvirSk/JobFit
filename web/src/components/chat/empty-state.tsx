"use client";

import { MessageSquare, Sparkles } from "lucide-react";

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

const SUGGESTIONS = [
  "Tell me about Razorpay",
  "Tell me about Zomato",
  "Tell me about Google",
  "How should I prepare for a tech interview?",
];

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-wrap gap-3 justify-center max-w-2xl px-4 select-none">
      {SUGGESTIONS.map((text) => (
        <button
          key={text}
          onClick={() => onSuggestionClick(text)}
          className="px-4 py-2 rounded-full border border-zinc-200 dark:border-border bg-transparent text-sm text-muted-foreground
            hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400
            transition-all duration-200 cursor-pointer"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
