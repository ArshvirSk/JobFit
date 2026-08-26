"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { toast } from "sonner";
import { fetchThreads, deleteThread as apiDeleteThread, type ChatThread } from "@/lib/chat-api";
import { useAuth } from "@/components/auth-provider";

interface ChatContextType {
  threads: ChatThread[];
  loadThreads: () => Promise<void>;
  updateThreadInList: (thread: ChatThread) => void;
  removeThreadFromList: (id: string) => void;
  addThreadToList: (thread: ChatThread) => void;
  deleteThread: (id: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const { session } = useAuth();

  const loadThreads = useCallback(async () => {
    if (!session) {
      setThreads([]);
      return;
    }
    try {
      const data = await fetchThreads();
      setThreads(data);
    } catch (err) {
      console.error("Failed to load threads:", err);
    }
  }, [session]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const updateThreadInList = useCallback((updatedThread: ChatThread) => {
    setThreads((prev) => {
      // If thread already exists, update it and move to top
      const exists = prev.find(t => t.id === updatedThread.id);
      if (exists) {
        return [updatedThread, ...prev.filter(t => t.id !== updatedThread.id)];
      }
      return [updatedThread, ...prev];
    });
  }, []);

  const removeThreadFromList = useCallback((id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addThreadToList = useCallback((thread: ChatThread) => {
    setThreads((prev) => [thread, ...prev]);
  }, []);

  const deleteThread = useCallback(async (id: string) => {
    try {
      await apiDeleteThread(id);
      removeThreadFromList(id);
      toast.success("Chat deleted");
    } catch (err) {
      console.error("Failed to delete thread:", err);
      toast.error("Failed to delete chat");
    }
  }, [removeThreadFromList]);

  return (
    <ChatContext.Provider
      value={{
        threads,
        loadThreads,
        updateThreadInList,
        removeThreadFromList,
        addThreadToList,
        deleteThread,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
