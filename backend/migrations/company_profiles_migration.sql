-- ============================================================
-- Phase 2: Company Profiles Cache
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name TEXT NOT NULL,
  category TEXT NOT NULL,
  data JSONB NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure we only have one cached entry per category per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_profiles_entity_category 
ON public.company_profiles(entity_name, category);

-- RLS Policies
ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to select
CREATE POLICY "Allow authenticated read access to company_profiles"
ON public.company_profiles FOR SELECT
TO authenticated
USING (true);

-- Allow service role / authenticated to insert/update (since backend does this)
CREATE POLICY "Allow authenticated insert/update to company_profiles"
ON public.company_profiles FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
