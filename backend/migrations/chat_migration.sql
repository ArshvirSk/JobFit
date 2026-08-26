-- ============================================================
-- Chat Feature Migration (Phase 1)
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Chat Threads — one per conversation
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Chat Messages — individual messages within a thread
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
  -- metadata stores: detected_entity, response_type ("generic"|"company_stub")
);

-- ============================================================
-- Row-Level Security (RLS)
-- ============================================================

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Thread policies: users can only access their own threads
CREATE POLICY "Users can read own threads"
  ON public.chat_threads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own threads"
  ON public.chat_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own threads"
  ON public.chat_threads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own threads"
  ON public.chat_threads FOR DELETE
  USING (auth.uid() = user_id);

-- Message policies: users can access messages in threads they own
CREATE POLICY "Users can read messages in own threads"
  ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
        AND chat_threads.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in own threads"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
        AND chat_threads.user_id = auth.uid()
    )
  );

-- ============================================================
-- Auto-update updated_at on chat_threads
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_chat_thread_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chat_threads
  SET updated_at = now()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_chat_message_insert ON public.chat_messages;
CREATE TRIGGER on_chat_message_insert
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_chat_thread_timestamp();

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_chat_threads_user_id ON public.chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_updated_at ON public.chat_threads(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON public.chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);
