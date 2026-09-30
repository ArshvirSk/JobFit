CREATE TABLE IF NOT EXISTS manual_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    note TEXT,
    linkedin_url TEXT,
    source TEXT DEFAULT 'manual_entry',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
