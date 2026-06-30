-- Quick End-of-Day debrief: one row per day. Run in the DASHBOARD Supabase.
CREATE TABLE daily_debrief (
  debrief_date DATE PRIMARY KEY,
  energy INT,                 -- 1–5
  went_well TEXT,
  note_for_later TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE daily_debrief ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON daily_debrief FOR ALL USING (true) WITH CHECK (true);
