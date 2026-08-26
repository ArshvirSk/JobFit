"use client";

import { use } from "react";
import { ChatShell } from "@/components/chat/chat-shell";

export default function ChatIdPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  
  return <ChatShell threadId={resolvedParams.id} />;
}
