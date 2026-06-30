-- Margaret "router" upgrade. Run in the DASHBOARD Supabase project.

-- A later-list / idea catcher: things worth keeping but not yet a task.
CREATE TABLE backlog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  source TEXT,                      -- e.g. "Meeting: <title>" or "manual"
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE backlog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON backlog_items FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_backlog_archived ON backlog_items(archived, created_at DESC);

-- Per-item classification from extraction, driving the router's smart default.
ALTER TABLE granola_extracted_tasks
  ADD COLUMN IF NOT EXISTS confidence TEXT;            -- high | low
ALTER TABLE granola_extracted_tasks
  ADD COLUMN IF NOT EXISTS suggested_destination TEXT; -- task|quick_task|note|backlog|ignore
