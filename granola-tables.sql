-- Phase 5 (Margaret): cached Granola meetings, transcripts, and the tasks Leo
-- extracts from them. Run in the DASHBOARD Supabase project (wsxgofbgpptlfxtcqnlx).

-- Meeting metadata (one row per Granola note).
CREATE TABLE granola_meetings (
  id TEXT PRIMARY KEY,                 -- Granola note id (not_*)
  title TEXT,
  summary TEXT,
  owner_name TEXT,
  owner_email TEXT,
  attendees JSONB DEFAULT '[]'::jsonb, -- [{ name, email }]
  meeting_date TIMESTAMPTZ,
  tasks_extracted BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full transcript text, flattened to "Speaker: line" rows.
CREATE TABLE granola_transcripts (
  meeting_id TEXT PRIMARY KEY REFERENCES granola_meetings(id) ON DELETE CASCADE,
  transcript TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Commitments Leo pulled from a transcript, pending the user's confirm.
CREATE TABLE granola_extracted_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id TEXT REFERENCES granola_meetings(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  due_date DATE,
  partner_id TEXT,        -- CRM partner id when an attendee matched
  partner_name TEXT,
  source_quote TEXT,
  status TEXT DEFAULT 'pending',  -- pending | confirmed | dismissed
  routed_to TEXT,                 -- crm | dashboard | null
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE granola_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE granola_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE granola_extracted_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON granola_meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON granola_transcripts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON granola_extracted_tasks FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_granola_meetings_date ON granola_meetings(meeting_date DESC);
CREATE INDEX idx_granola_tasks_meeting ON granola_extracted_tasks(meeting_id);
CREATE INDEX idx_granola_tasks_status ON granola_extracted_tasks(status);
