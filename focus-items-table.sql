-- Free-form "focus notes" for a given day (intentions that aren't tasks),
-- set at End of Day and surfaced in the Morning Brief alongside starred tasks.
CREATE TABLE focus_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_date DATE NOT NULL,
  text TEXT NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE focus_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON focus_items
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_focus_items_date ON focus_items(focus_date);
