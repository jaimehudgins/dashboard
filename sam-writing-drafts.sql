-- Phase 6a (Sam): a drafting surface for public-voice writing. Run in the
-- DASHBOARD Supabase.
CREATE TABLE writing_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  content TEXT DEFAULT '',
  status TEXT DEFAULT 'in_progress',  -- in_progress | ready_to_publish | published | archived
  audience TEXT,                       -- LinkedIn | Blog | Internal | Conference talk
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE writing_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON writing_drafts FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_writing_drafts_status ON writing_drafts(status, updated_at DESC);
