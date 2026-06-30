-- Phase 6b: Decision log. A structured record of decisions + reasoning, with
-- outcomes filled in later for retrospective. Run in the DASHBOARD Supabase.
CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision TEXT NOT NULL,            -- the decision (short)
  context TEXT,                      -- situation / why it came up
  options TEXT,                      -- options considered
  choice TEXT,                       -- what was chosen
  reasoning TEXT,                    -- why
  expected_outcome TEXT,
  actual_outcome TEXT,               -- filled in at review
  decided_at DATE DEFAULT CURRENT_DATE,
  reviewed_at DATE,                  -- when the retrospective was done
  status TEXT DEFAULT 'open',        -- open | reviewed | archived
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON decisions FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_decisions_status_date ON decisions(status, decided_at DESC);
