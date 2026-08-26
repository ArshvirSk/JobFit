"use client";

export function TypingIndicator() {
  return (
    <div className="flex px-4 py-6">
      <div className="flex gap-4 w-full max-w-4xl mx-auto">
        <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-primary shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
        </div>
        <div className="flex items-center gap-1.5 py-1">
          <div className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
              style={{ animationDelay: "0ms", animationDuration: "0.8s" }}
            />
            <span
              className="inline-block h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
              style={{ animationDelay: "150ms", animationDuration: "0.8s" }}
            />
            <span
              className="inline-block h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
              style={{ animationDelay: "300ms", animationDuration: "0.8s" }}
            />
          </div>
          <span className="text-xs text-muted-foreground ml-2">Thinking...</span>
        </div>
      </div>
    </div>
  );
}
