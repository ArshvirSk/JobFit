-- Create project_ideas table to store LLM-generated project ideas for skill gaps
CREATE TABLE IF NOT EXISTS public.project_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_hash TEXT NOT NULL,
    skill_gap TEXT NOT NULL,
    project_title TEXT NOT NULL,
    project_description TEXT NOT NULL,
    estimated_time TEXT,
    why_this_helps TEXT,
    stretch_from_current_skills TEXT,
    status TEXT DEFAULT 'suggested',
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, job_hash, skill_gap)
);

-- RLS Policies
ALTER TABLE public.project_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own project ideas"
  ON public.project_ideas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own project ideas"
  ON public.project_ideas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own project ideas"
  ON public.project_ideas FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own project ideas"
  ON public.project_ideas FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_ideas_user_id ON public.project_ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_project_ideas_lookup ON public.project_ideas(user_id, job_hash, skill_gap);
