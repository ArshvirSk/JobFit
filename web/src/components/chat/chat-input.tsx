"use client";

import { KeyboardEvent, useEffect, useRef } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
}

export function ChatInput({ value, onChange, onSend, disabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }
  }, [value]);

  // Focus textarea on mount
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSend();
      }
    }
  };

  return (
    <div className="w-full relative shadow-sm rounded-[2rem] border border-zinc-200 dark:border-border bg-card hover:shadow-md transition-shadow duration-200">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          disabled
            ? "Waiting for response..."
            : "Ask JobFit..."
        }
        disabled={disabled}
        rows={1}
        className="w-full resize-none bg-transparent text-sm md:text-base text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed pl-6 pr-14 py-4 max-h-40 rounded-[2rem]"
      />
      <div className="absolute right-2.5 bottom-3">
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="h-9 w-9 rounded-full flex items-center justify-center p-0 shrink-0 aspect-square
            bg-emerald-500 text-white
            shadow-sm hover:bg-emerald-600
            disabled:bg-zinc-200 disabled:dark:bg-muted disabled:text-zinc-400 disabled:dark:text-muted-foreground disabled:shadow-none
            transition-all duration-200 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      </div>
    </div>
  );
}
