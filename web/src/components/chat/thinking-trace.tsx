"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Database,
  Globe,
  Loader2,
  Search,
  Sparkles,
  Terminal,
} from "lucide-react";

export type TraceKind = "run" | "think" | "search" | "fetch" | "cache" | "done" | "error";

export interface TraceStep {
  id: string;
  label: string;
  text: string;
  detail?: string;
  kind: TraceKind;
  terminal?: boolean;
}

const KIND_ICON: Record<TraceKind, React.ComponentType<{ className?: string }>> = {
  run: Terminal,
  think: Sparkles,
  search: Search,
  fetch: Globe,
  cache: Database,
  done: CheckCircle2,
  error: AlertTriangle,
};

/** label, kind, terminal — mapped from a backend research-activity event. */
const ACTIVITY_MAP: Record<string, [string, TraceKind, boolean]> = {
  start: ["Run", "run", false],
  cache_hit: ["Cache", "cache", true],
  plan: ["Plan", "think", false],
  plan_ready: ["Plan", "think", true],
  search: ["Search", "search", false],
  search_done: ["Search", "search", true],
  search_error: ["Search", "error", true],
  fetch_start: ["Fetch", "fetch", false],
  page: ["Fetch", "fetch", true],
  page_skip: ["Fetch", "fetch", true],
  fetch_done: ["Fetch", "fetch", true],
  synthesize: ["Synthesize", "think", false],
  round_done: ["Round", "think", true],
  done: ["Done", "done", true],
  fallback: ["Fallback", "error", true],
  stopped: ["Stopped", "error", true],
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.length > 60 ? url.slice(0, 57) + "…" : url;
  }
}

/** Convert a research-activity SSE event into a trace step (null = ignore). */
export function traceStepFromActivity(ev: any): TraceStep | null {
  const meta = ACTIVITY_MAP[ev?.step];
  if (!meta) return null;
  const [label, kind, terminal] = meta;
  const detail = typeof ev.detail === "string" ? ev.detail : "";
  let text = detail || ev.step;

  if (ev.step === "plan_ready") {
    const qs = detail.split(" | ").filter(Boolean);
    text = qs.length
      ? `${qs.length} queries: ${qs[0]}${qs.length > 1 ? " …" : ""}`
      : "query plan ready";
  } else if (ev.step === "search") {
    text = `"${detail}"`;
  } else if (ev.step === "page") {
    text = `read ${hostOf(detail)}`;
  } else if (ev.step === "page_skip") {
    text = `skipped ${hostOf(detail)}`;
  } else if (ev.step === "round_done" || ev.step === "done") {
    const cov =
      typeof ev.coverage === "number" ? ` · ${Math.round(ev.coverage * 100)}% coverage` : "";
    text = (detail || ev.step) + cov;
  }

  return { id: `a-${ev.id}`, label, text, detail: detail || undefined, kind, terminal };
}

/** Convert a chat-stream progress string into a trace step. */
export function traceStepFromProgress(msg: string): TraceStep {
  let label = "Thinking";
  let kind: TraceKind = "think";
  if (/^Searching live data/i.test(msg)) {
    label = "Search";
    kind = "search";
  } else if (/^Found /i.test(msg)) {
    label = "Fetch";
    kind = "fetch";
  } else if (/^(Retries|Cache|Using cached)/i.test(msg)) {
    label = "Cache";
    kind = "cache";
  }
  return {
    id: `p-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    label,
    text: msg,
    kind,
    terminal: false,
  };
}

function TraceRow({
  step,
  isActive,
  isDone,
}: {
  step: TraceStep;
  isActive: boolean;
  isDone: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const Icon = KIND_ICON[step.kind] ?? Sparkles;
  const expandable = Boolean(step.detail);

  return (
    <div className="animate-in fade-in slide-in-from-left-1 duration-200">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center gap-2.5 px-2 py-[7px] rounded-md text-left transition-colors",
          expandable ? "hover:bg-muted/70 cursor-pointer" : "cursor-default"
        )}
      >
        {isActive ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
        ) : (
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              step.kind === "error"
                ? "text-amber-500"
                : isDone || step.terminal
                ? "text-emerald-500"
                : "text-muted-foreground"
            )}
          />
        )}
        <span className="text-[13px] font-semibold text-foreground shrink-0 w-[74px] truncate">
          {step.label}
        </span>
        <span className="text-[13px] text-muted-foreground truncate flex-1 min-w-0">
          {step.text}
        </span>
        {expandable && (
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150",
              open && "rotate-90"
            )}
          />
        )}
      </button>
      {open && step.detail && (
        <div className="mx-2 mb-1.5 mt-0.5 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11.5px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-auto animate-in fade-in duration-150">
          {step.detail}
        </div>
      )}
    </div>
  );
}

export function ThinkingTrace({ steps, active }: { steps: TraceStep[]; active?: boolean }) {
  if (!steps.length) return null;
  const lastIndex = steps.length - 1;

  return (
    <div className="mb-3 rounded-xl border border-border bg-card/70 overflow-hidden shadow-sm animate-in fade-in slide-in-from-left-2 duration-300">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full shrink-0",
            active ? "bg-blue-500 animate-pulse" : "bg-emerald-500"
          )}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {active ? "Thinking" : "Thought process"}
        </span>
        <span className="text-[11px] text-muted-foreground/70 ml-auto font-mono">
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="p-1.5 max-h-72 overflow-y-auto">
        {steps.map((s, i) => (
          <TraceRow
            key={s.id}
            step={s}
            isActive={Boolean(active) && i === lastIndex && !s.terminal}
            isDone={s.terminal || i < lastIndex}
          />
        ))}
      </div>
    </div>
  );
}
