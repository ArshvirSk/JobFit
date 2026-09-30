-- Add new fields to the users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP WITH TIME ZONE;

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    target_roles TEXT[],
    seniority TEXT,
    locations TEXT[],
    work_mode TEXT,
    target_sectors TEXT[],
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_connectors table
CREATE TABLE IF NOT EXISTS user_connectors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'gmail', 'calendar', 'outlook'
    access_token TEXT NOT NULL, -- Encrypted in application logic before saving, or using pgcrypto if desired, but we will store encrypted strings from Python
    refresh_token TEXT, -- Encrypted
    scopes_granted TEXT[],
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'revoked', 'expired'
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, provider)
);

-- RLS policies
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own preferences" ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences" ON user_preferences FOR ALL USING (auth.uid() = user_id);

ALTER TABLE user_connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own connectors" ON user_connectors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own connectors" ON user_connectors FOR ALL USING (auth.uid() = user_id);
