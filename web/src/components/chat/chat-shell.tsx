"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { MessageList, type DisplayMessage } from "./message-list";
import { ChatInput } from "./chat-input";
import { EmptyState } from "./empty-state";
import {
  createThread,
  fetchMessages,
  sendMessage,
  consumeStream,
  type ChatMessage,
} from "@/lib/chat-api";
import { useChat } from "./chat-context";
import { useRouter } from "next/navigation";
import { CompanyPanel } from "./company-panel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Bell, X } from "lucide-react";

export function ChatShell({ threadId: initialThreadId }: { threadId?: string }) {
  const router = useRouter();
  
  // Thread state from context
  const { 
    threads, 
    updateThreadInList, 
    addThreadToList 
  } = useChat();

  const [currentThreadId, setCurrentThreadId] = useState<string | null>(initialThreadId || null);
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);
  
  useEffect(() => {
    setCurrentThreadId(initialThreadId || null);
  }, [initialThreadId]);
  
  const [isCreatingThread, setIsCreatingThread] = useState(false);

  // Message state
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // Panel state
  const [activeCompanySlugs, setActiveCompanySlugs] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  // Resize state
  const [chatWidth, setChatWidth] = useState(40);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = (e.clientX / window.innerWidth) * 100;
      setChatWidth(Math.min(Math.max(newWidth, 20), 80));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await api.getNotifications();
        setNotifications(res.data);
      } catch (e) {
        console.error("Failed to fetch notifications", e);
      }
    };
    fetchNotifs();
  }, []);

  const dismissNotification = async (notifId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notifId));
    try {
      await api.markNotificationRead(notifId);
    } catch (e) {
      console.error("Failed to mark read", e);
    }
  };

  const handleOpenProfile = useCallback((slug: string) => {
    setActiveCompanySlugs([slug]);
  }, []);

  const handleCloseProfile = useCallback((slugToClose: string) => {
    setActiveCompanySlugs(prev => prev.filter(s => s !== slugToClose));
  }, []);

  const handleTailorJob = useCallback((url: string, missingRequirements?: string[], extra?: {company: string, role: string, fitLabel?: string}) => {
    let targetUrl = `/tailor?jdUrl=${encodeURIComponent(url)}`;
    if (missingRequirements && missingRequirements.length > 0) {
      targetUrl += `&gaps=${encodeURIComponent(JSON.stringify(missingRequirements))}`;
    }
    if (extra) {
      targetUrl += `&company=${encodeURIComponent(extra.company)}&role=${encodeURIComponent(extra.role)}`;
      if (extra.fitLabel) {
        targetUrl += `&fitLabel=${encodeURIComponent(extra.fitLabel)}`;
      }
    }
    router.push(targetUrl);
  }, [router]);

  // Input state
  const [inputValue, setInputValue] = useState("");

  // ── Load messages when active thread changes ─────────
  useEffect(() => {
    if (currentThreadId && currentThreadId !== createdThreadId) {
      loadMessages(currentThreadId);
    } else if (!currentThreadId) {
      setMessages([]);
    }
  }, [currentThreadId, createdThreadId]);

  // Reference to track the latest thread being loaded
  const latestLoadThreadIdRef = useRef<string | null>(null);

  const loadMessages = async (threadId: string) => {
    latestLoadThreadIdRef.current = threadId;
    setIsLoadingMessages(true);
    try {
      const data = await fetchMessages(threadId);
      
      // Only apply messages if this is still the thread we want to load
      if (latestLoadThreadIdRef.current === threadId) {
        setMessages((prev) => {
          // If we are currently streaming in THIS thread, don't overwrite optimistic state
          // (This prevents the race condition when creating a new thread and sending a message simultaneously)
          if (prev.some((m) => m.isStreaming)) {
            return prev;
          }
          return data.map((m: ChatMessage) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            isStreaming: false,
            metadata: m.metadata,
          }));
        });
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
      toast.error("Failed to load messages");
    } finally {
      if (latestLoadThreadIdRef.current === threadId) {
        setIsLoadingMessages(false);
      }
    }
  };

  // ── Send message ─────────────────────────────────────
  const handleSend = useCallback(async (retryContent?: string | React.FormEvent) => {
    // If retryContent is a string, use it. Otherwise, use inputValue.
    const content = typeof retryContent === 'string' ? retryContent.trim() : inputValue.trim();
    if (!content || isStreaming) return;

    // If no active thread, create one first
    let threadId = currentThreadId;
    if (!threadId) {
      setIsCreatingThread(true);
      try {
        const thread = await createThread();
        threadId = thread.id;
        addThreadToList(thread);
        setCreatedThreadId(thread.id);
        setCurrentThreadId(thread.id);
        window.history.replaceState(null, "", `/chat/${thread.id}`);
      } catch (err) {
        console.error("Failed to create thread:", err);
        toast.error("Failed to create chat");
        setIsCreatingThread(false);
        return;
      } finally {
        setIsCreatingThread(false);
      }
    }

    // Optimistically add user message
    const userMsgId = `temp-user-${Date.now()}`;
    const assistantMsgId = `temp-assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content, isStreaming: false },
    ]);
    setInputValue("");
    setIsStreaming(true);

    try {
      const stream = await sendMessage(threadId, content);

      // Add empty assistant message for streaming
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", isStreaming: true },
      ]);

      await consumeStream(stream, (event) => {
        if (event.error) {
          toast.error("Something went wrong generating a response");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false, isError: true } : m
            )
          );
          return;
        }

        if (!event.done) {
          // Append token to the streaming assistant message
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === assistantMsgId) {
                const newMetadata = event.progress ? {
                  ...m.metadata,
                  progress: [...(m.metadata?.progress || []), event.progress]
                } : m.metadata;
                
                return {
                  ...m,
                  content: m.content + (event.token || ""),
                  metadata: newMetadata
                };
              }
              return m;
            })
          );
        } else {
          // Mark streaming as complete
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false, metadata: event.metadata } : m
            )
          );
          
          if (event.metadata?.response_type === "company_profile" && event.metadata?.detected_entities) {
            const slugs = event.metadata.detected_entities.map((e: string) => e.replace(/ /g, '-').toLowerCase());
            setActiveCompanySlugs(slugs);
          }
        }
      });

      // Update thread title and preview in context
      const currentThread = threads.find(t => t.id === threadId);
      if (currentThread) {
        updateThreadInList({
          ...currentThread,
          title: currentThread.title === "New Chat" 
            ? content.slice(0, 50) + (content.length > 50 ? "..." : "")
            : currentThread.title,
          updated_at: new Date().toISOString(),
          last_message_preview: content.slice(0, 100),
        });
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      toast.error("Failed to send message");
      // Keep user message, mark assistant message as error
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, isStreaming: false, isError: true } : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [inputValue, isStreaming, currentThreadId, addThreadToList, updateThreadInList, threads]);

  const handleRetry = useCallback((messageId: string) => {
    const assistantIndex = messages.findIndex(m => m.id === messageId);
    if (assistantIndex <= 0) return;
    
    const userMsg = messages[assistantIndex - 1];
    if (userMsg && userMsg.role === 'user') {
      // Remove the failed assistant message and the user message (handleSend will re-add them)
      setMessages(prev => prev.filter(m => m.id !== messageId && m.id !== userMsg.id));
      handleSend(userMsg.content);
    }
  }, [messages, handleSend]);

  // ── Handle suggestion chip click ─────────────────────
  const handleSuggestionClick = useCallback(
    (text: string) => {
      setInputValue(text);
      // Trigger send after state update
      setTimeout(async () => {
        if (isStreaming) return;

        let threadId = currentThreadId;
        if (!threadId) {
          setIsCreatingThread(true);
          try {
            const thread = await createThread();
            threadId = thread.id;
            addThreadToList(thread);
            setCreatedThreadId(thread.id);
            setCurrentThreadId(thread.id);
            window.history.replaceState(null, "", `/chat/${thread.id}`);
          } catch (err) {
            console.error("Failed to create thread:", err);
            toast.error("Failed to create chat");
            setIsCreatingThread(false);
            return;
          } finally {
            setIsCreatingThread(false);
          }
        }

        const userMsgId = `temp-user-${Date.now()}`;
        const assistantMsgId = `temp-assistant-${Date.now()}`;

        setMessages((prev) => [
          ...prev,
          { id: userMsgId, role: "user", content: text, isStreaming: false },
        ]);
        setInputValue("");
        setIsStreaming(true);

        try {
          const stream = await sendMessage(threadId!, text);

          setMessages((prev) => [
            ...prev,
            {
              id: assistantMsgId,
              role: "assistant",
              content: "",
              isStreaming: true,
            },
          ]);

          await consumeStream(stream, (event) => {
            if (event.error) {
              toast.error("Something went wrong generating a response");
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, isStreaming: false, isError: true } : m
                )
              );
              return;
            }
            if (!event.done) {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id === assistantMsgId) {
                    const newMetadata = event.progress ? {
                      ...m.metadata,
                      progress: [...(m.metadata?.progress || []), event.progress]
                    } : m.metadata;
                    
                    return {
                      ...m,
                      content: m.content + (event.token || ""),
                      metadata: newMetadata
                    };
                  }
                  return m;
                })
              );
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, isStreaming: false, metadata: event.metadata } : m
                )
              );
              
              if (event.metadata?.response_type === "company_profile" && event.metadata?.detected_entities) {
                const slugs = event.metadata.detected_entities.map((e: string) => e.replace(/ /g, '-').toLowerCase());
                setActiveCompanySlugs(slugs);
              }
            }
          });

          const currentThread = threads.find(t => t.id === threadId);
          if (currentThread) {
            updateThreadInList({
              ...currentThread,
              title: currentThread.title === "New Chat"
                ? text.slice(0, 50) + (text.length > 50 ? "..." : "")
                : currentThread.title,
              updated_at: new Date().toISOString(),
              last_message_preview: text.slice(0, 100),
            });
          }
        } catch (err) {
          console.error("Failed to send message:", err);
          toast.error("Failed to send message");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false, isError: true } : m
            )
          );
        } finally {
          setIsStreaming(false);
        }
      }, 50);
    },
    [isStreaming, currentThreadId, addThreadToList, updateThreadInList, threads]
  );

  return (
    <div className="flex h-full w-full relative">
      {/* Main Chat Area */}
      <div 
        className={cn("flex flex-col h-full bg-background transition-none", activeCompanySlugs.length > 0 ? "hidden md:flex shadow-sm z-20" : "w-full")}
        style={activeCompanySlugs.length > 0 ? { width: `${chatWidth}%` } : undefined}
      >
        {notifications.length > 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg shadow-lg p-3 flex items-start gap-3 animate-in slide-in-from-top-4">
            <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">New Strong Matches!</h4>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 leading-snug">
                {notifications.length} new role(s) found at your watched companies that strongly match your profile.
              </p>
              <div className="flex gap-2 mt-2">
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => {
                  const company = notifications[0].company_name.replace(/ /g, '-').toLowerCase();
                  handleOpenProfile(company);
                  dismissNotification(notifications[0].id);
                }}>
                  View {notifications[0].company_name}
                </Button>
              </div>
            </div>
            <button onClick={() => dismissNotification(notifications[0].id)} className="text-blue-500 hover:text-blue-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {messages.length === 0 && !isLoadingMessages && !isCreatingThread ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <h2 className="text-3xl md:text-4xl font-semibold text-foreground mb-8 text-center">Who are you looking for?</h2>
            <div className="w-full max-w-2xl mb-8">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSend}
                disabled={isStreaming}
              />
            </div>
            <EmptyState onSuggestionClick={handleSuggestionClick} />
          </div>
        ) : (
          <>
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              isLoading={isLoadingMessages || isCreatingThread}
              onSuggestionClick={handleSuggestionClick}
              onOpenProfile={handleOpenProfile}
              onRetry={handleRetry}
            />
            <div className="p-4 shrink-0 bg-transparent">
              <div className="max-w-3xl mx-auto">
                <ChatInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSend={handleSend}
                  disabled={isStreaming}
                />
                <p className="text-[11px] text-muted-foreground text-center mt-2 select-none">
                  Press Enter to send · Shift+Enter for new line
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Resizer Handle */}
      {activeCompanySlugs.length > 0 && (
        <div 
          className={cn(
            "hidden md:flex w-1.5 cursor-col-resize z-30 transition-colors shrink-0",
            isDragging ? "bg-emerald-500" : "bg-border hover:bg-emerald-400"
          )}
          onMouseDown={handleMouseDown}
        />
      )}

      {/* Side Panels */}
      {activeCompanySlugs.length > 0 && (
        <div className="hidden md:flex flex-row flex-1 h-full min-w-0 bg-background shadow-xl z-10 animate-in slide-in-from-right-8 duration-300 overflow-x-auto">
          {activeCompanySlugs.map((slug) => (
            <div key={slug} className={cn("flex-1 h-full min-w-[400px] border-r border-border last:border-r-0", activeCompanySlugs.length === 1 ? "" : "max-w-[600px]")}>
              <CompanyPanel 
                slug={slug}
                onClose={() => handleCloseProfile(slug)}
                onTailorJob={handleTailorJob}
                onOpenProfile={handleOpenProfile}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
