-- Create application_activities table for tracking history of an application
CREATE TABLE IF NOT EXISTS application_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL, -- 'email_sent', 'event_created', 'status_detected'
    details JSONB NOT NULL DEFAULT '{}'::jsonb, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies
ALTER TABLE application_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own application activities" ON application_activities FOR SELECT USING (
    application_id IN (SELECT id FROM applications WHERE user_id = auth.uid())
);
CREATE POLICY "Users can manage their own application activities" ON application_activities FOR ALL USING (
    application_id IN (SELECT id FROM applications WHERE user_id = auth.uid())
);
