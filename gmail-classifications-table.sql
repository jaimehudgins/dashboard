-- Per-thread email urgency, set by Donna's classifier (Phase 4).
-- Orthogonal to the Leo/* bucket labels: this is the 🔥 / ❓ / 🕒 signal.
CREATE TABLE gmail_classifications (
  thread_id TEXT PRIMARY KEY,
  urgency TEXT NOT NULL,            -- 'now' | 'question' | 'later'
  reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gmail_classifications ENABLE ROW LEVEL SECURITY;

-- Allow all with the anon key (single-user dashboard; NextAuth is the gate).
CREATE POLICY "Allow all access" ON gmail_classifications
  FOR ALL USING (true) WITH CHECK (true);
