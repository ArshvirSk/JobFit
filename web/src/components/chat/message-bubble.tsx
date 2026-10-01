"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { User, Bot, ArrowRight, Loader2, CheckCircle2, CircleDashed, AlertTriangle, RefreshCcw, Mail, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThinkingTrace, type TraceStep } from "./thinking-trace";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
  metadata?: any;
  trace?: TraceStep[];
  onOpenProfile?: (slug: string) => void;
  onRetry?: () => void;
  onDraftFollowUp?: (payload: { company: string; role: string; application_id?: string; days_since?: number }) => void;
  onTailor?: (url: string, gaps?: string[]) => void;
}

export function MessageBubble({ role, content, isStreaming, isError, metadata, trace, onOpenProfile, onRetry, onDraftFollowUp, onTailor }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex gap-4 px-4 py-6 animate-in fade-in slide-in-from-bottom-2 duration-300 bg-transparent"
      )}
    >
      {/* Container to center the content and restrict width */}
      <div className="flex gap-4 w-full max-w-4xl mx-auto">
        {/* Avatar */}
        <div
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-1",
            isUser
              ? "bg-blue-600 shadow-sm"
              : "bg-primary shadow-sm"
          )}
        >
          {isUser ? (
            <User className="h-4 w-4 text-white" />
          ) : (
            <Bot className="h-4 w-4 text-primary-foreground" />
          )}
        </div>

        {/* Message content */}
        <div
          className={cn(
            "flex-1 text-sm leading-relaxed break-words prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:p-0",
            isUser ? "text-foreground" : "text-foreground",
            isStreaming && !isUser && "min-h-[2rem]"
          )}
        >
          {!isUser && trace && trace.length > 0 && (
            <div className="mb-3">
              <ThinkingTrace steps={trace} active={isStreaming} />
            </div>
          )}
          <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{children}</a>,
            ul: ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-1">{children}</ol>,
            li: ({ children }) => <li>{children}</li>,
            h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-4">{children}</h1>,
            h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-4">{children}</h2>,
            h3: ({ children }) => <h3 className="text-sm font-bold mb-2 mt-4">{children}</h3>,
            table: ({ children }) => <div className="overflow-x-auto my-4"><table className="min-w-full divide-y divide-border border border-border rounded-md">{children}</table></div>,
            thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
            tbody: ({ children }) => <tbody className="divide-y divide-border bg-card">{children}</tbody>,
            th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{children}</th>,
            td: ({ children }) => <td className="px-3 py-2 text-sm text-foreground whitespace-nowrap">{children}</td>,
          }}
        >
          {content}
        </ReactMarkdown>
        {isStreaming && !isUser && (!metadata?.progress || metadata.progress.length === 0) && (
          <span className="inline-block w-1.5 h-4 bg-blue-500 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
        )}
        
        {isStreaming && !isUser && metadata?.progress && metadata.progress.length > 0 && !(trace && trace.length > 0) && (
          <div className="mt-4 mb-2 p-5 bg-card border border-border shadow-sm rounded-xl space-y-4 max-w-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Analyzing Data</span>
            </div>
            {metadata.progress.map((step: string, index: number) => {
              const isLast = index === metadata.progress.length - 1;
              return (
                <div key={index} className="flex items-center gap-3 text-sm animate-in fade-in slide-in-from-left-4 duration-300 fill-mode-forwards" style={{ animationDelay: `${index * 100}ms` }}>
                  {isLast ? (
                    <div className="relative flex h-5 w-5 items-center justify-center shrink-0">
                      <div className="absolute h-full w-full rounded-full border-2 border-blue-100 border-t-blue-500 animate-spin"></div>
                    </div>
                  ) : (
                    <div className="relative flex h-5 w-5 items-center justify-center shrink-0">
                      <div className="absolute h-full w-full rounded-full bg-emerald-100 scale-in-center animate-in zoom-in duration-300"></div>
                      <CheckCircle2 className="h-3 w-3 text-emerald-600 relative z-10" strokeWidth={3} />
                    </div>
                  )}
                  <span className={cn(
                    "transition-all duration-500",
                    isLast ? "text-blue-700 dark:text-blue-400 font-medium" : "text-muted-foreground"
                  )}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        
        {metadata?.response_type === "company_profile" && metadata?.detected_entities && !isStreaming && (
          <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
            {metadata.detected_entities.map((entity: string) => (
              <div key={entity} className="flex items-center justify-between p-4 bg-card border border-border rounded-lg shadow-sm">
                <div>
                  <h3 className="font-bold text-base text-foreground">{entity}</h3>
                  <p className="text-sm text-muted-foreground">Company Profile available</p>
                </div>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => onOpenProfile?.(entity.replace(/ /g, '-').toLowerCase())}
                >
                  Open profile <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {metadata?.response_type === "email_draft" && metadata?.action_metadata && !isStreaming && (
          <EmailDraftPreview metadata={metadata.action_metadata} />
        )}

        {metadata?.response_type === "calendar_draft" && metadata?.action_metadata && !isStreaming && (
          <CalendarDraftPreview metadata={metadata.action_metadata} />
        )}

        {metadata?.action_buttons && metadata.action_buttons.length > 0 && !isStreaming && (
          <ActionButtonsBar
            buttons={metadata.action_buttons}
            onOpenProfile={onOpenProfile}
            onDraftFollowUp={onDraftFollowUp}
            onTailor={onTailor}
          />
        )}

        {isError && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg flex flex-col gap-3">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Failed to generate a response</span>
            </div>
            {onRetry && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onRetry}
                className="w-fit border-red-200 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                <RefreshCcw className="h-3.5 w-3.5 mr-2" /> Try Again
              </Button>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function EmailDraftPreview({ metadata }: { metadata: any }) {
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleSend = async () => {
    setStatus("loading");
    try {
      const { api } = await import("@/lib/api");
      await api.sendEmail({
        recipient: metadata.recipient,
        subject: metadata.subject,
        body: metadata.body
      });
      setStatus("success");
    } catch (e: any) {
      if (e.response?.status === 403) {
        // Need to re-auth
        setErrorMsg("Missing Gmail scopes. Please reconnect Gmail in Settings.");
      } else {
        setErrorMsg("Failed to send email.");
      }
      setStatus("error");
    }
  };

  return (
    <div className="mt-4 p-4 border border-border bg-card rounded-xl flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <span className="font-semibold text-foreground">Draft Email</span>
      </div>
      <div><span className="text-muted-foreground font-medium">To:</span> {metadata.recipient}</div>
      <div><span className="text-muted-foreground font-medium">Subject:</span> {metadata.subject}</div>
      <div className="whitespace-pre-wrap mt-2 p-3 bg-muted/50 rounded-lg">{metadata.body}</div>
      
      {status === "error" && <div className="text-red-500 mt-2 text-xs">{errorMsg}</div>}
      
      <div className="mt-2 flex justify-end">
        {status === "success" ? (
          <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Sent</span>
        ) : (
          <Button onClick={handleSend} disabled={status === "loading"}>
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm & Send
          </Button>
        )}
      </div>
    </div>
  );
}

function CalendarDraftPreview({ metadata }: { metadata: any }) {
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleCreate = async () => {
    setStatus("loading");
    try {
      const { api } = await import("@/lib/api");
      await api.createCalendarEvent({
        title: metadata.title,
        start_time: metadata.start_time,
        end_time: metadata.end_time,
        description: metadata.description
      });
      setStatus("success");
    } catch (e: any) {
      if (e.response?.status === 403) {
        setErrorMsg("Missing Calendar scopes. Please reconnect Google Calendar in Settings.");
      } else {
        setErrorMsg("Failed to create event.");
      }
      setStatus("error");
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="mt-4 p-4 border border-border bg-card rounded-xl flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <span className="font-semibold text-foreground">Draft Calendar Event</span>
      </div>
      <div><span className="text-muted-foreground font-medium">Title:</span> {metadata.title}</div>
      <div><span className="text-muted-foreground font-medium">Start:</span> {formatDate(metadata.start_time)}</div>
      <div><span className="text-muted-foreground font-medium">End:</span> {formatDate(metadata.end_time)}</div>
      {metadata.description && (
        <div className="whitespace-pre-wrap mt-2 p-3 bg-muted/50 rounded-lg">{metadata.description}</div>
      )}
      
      {status === "error" && <div className="text-red-500 mt-2 text-xs">{errorMsg}</div>}
      
      <div className="mt-2 flex justify-end">
        {status === "success" ? (
          <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Created</span>
        ) : (
          <Button onClick={handleCreate} disabled={status === "loading"}>
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create Event
          </Button>
        )}
      </div>
    </div>
  );
}


interface ActionButtonsBarProps {
  buttons: Array<{
    label: string;
    action_type: string;
    payload: Record<string, any>;
  }>;
  onOpenProfile?: (slug: string) => void;
  onDraftFollowUp?: (payload: { company: string; role: string; application_id?: string; days_since?: number }) => void;
  onTailor?: (url: string, gaps?: string[]) => void;
}

function ActionButtonsBar({ buttons, onOpenProfile, onDraftFollowUp, onTailor }: ActionButtonsBarProps) {
  return (
    <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-2">
      {buttons.map((btn, idx) => {
        switch (btn.action_type) {
          case "open_profile":
            return (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onOpenProfile?.(btn.payload.slug as string)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {btn.label}
              </Button>
            );
          case "email_draft":
            return (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onDraftFollowUp?.({
                  company: btn.payload.company as string,
                  role: btn.payload.role as string,
                  application_id: btn.payload.application_id as string | undefined,
                  days_since: btn.payload.days_since as number | undefined,
                })}
              >
                <Mail className="h-3.5 w-3.5" />
                {btn.label}
              </Button>
            );
          case "open_tailor":
            return (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onTailor?.(btn.payload.url as string, btn.payload.gaps as string[] | undefined)}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                {btn.label}
              </Button>
            );
          default:
            return (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                {btn.label}
              </Button>
            );
        }
      })}
    </div>
  );
}
