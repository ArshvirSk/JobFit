-- Create detected_events table for surfacing low-confidence email extractions and upcoming calendar interviews
CREATE TABLE IF NOT EXISTS detected_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'email_application_status', 'calendar_interview'
    company_name TEXT,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb, 
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'dismissed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add source column to applications tracker
ALTER TABLE applications ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS source_reference_id TEXT;

-- RLS policies
ALTER TABLE detected_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own detected events" ON detected_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own detected events" ON detected_events FOR ALL USING (auth.uid() = user_id);
