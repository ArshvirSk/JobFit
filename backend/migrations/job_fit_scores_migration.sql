-- ============================================================
-- JobFit Supabase Migration for Job Fit Scores
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Add parsed_json column to base_resumes to cache the parsed resume
ALTER TABLE public.base_resumes 
ADD COLUMN IF NOT EXISTS parsed_json JSONB;

-- Create job_fit_scores table to cache batched job scoring
CREATE TABLE IF NOT EXISTS public.job_fit_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_hash TEXT NOT NULL,
  fit_data JSONB NOT NULL,
  resume_id UUID REFERENCES public.base_resumes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_hash)
);

-- Enable RLS
ALTER TABLE public.job_fit_scores ENABLE ROW LEVEL SECURITY;

-- Job Fit Scores policies
CREATE POLICY "Users can read own fit scores"
  ON public.job_fit_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fit scores"
  ON public.job_fit_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fit scores"
  ON public.job_fit_scores FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_job_fit_scores_user_id ON public.job_fit_scores(user_id);
