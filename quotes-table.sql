-- Daily West Wing quote (Phase 0; surfaced on /brief in Phase 1)
-- Selection is deterministic-per-date: order by created_at, pick index = dayOfYear % count.
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote TEXT NOT NULL,
  speaker TEXT,                        -- e.g. 'Leo McGarry'
  context TEXT,                        -- episode / scene note, optional
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Allow all operations with anon key (single-user dashboard; NextAuth is the gate)
CREATE POLICY "Allow all access" ON quotes
  FOR ALL USING (true) WITH CHECK (true);

-- Seed set (expand any time; the daily pick rotates over whatever rows exist)
INSERT INTO quotes (quote, speaker, context) VALUES
  ('What''s next?', 'Jed Bartlet', 'The engine of the Bartlet White House.'),
  ('Decisions are made by those who show up.', 'Jed Bartlet', NULL),
  ('Act as if ye have faith and faith shall be given to you.', 'Jed Bartlet', 'The Bartlet family motto.'),
  ('Break''s over.', 'Leo McGarry', 'Rallying the room back to work.'),
  ('As long as I''ve got a job, you''ve got a job. You understand?', 'Leo McGarry', 'The friend-in-the-hole parable.'),
  ('Never doubt that a small group of thoughtful, committed citizens can change the world; indeed, it''s the only thing that ever has.', 'Margaret Mead', 'A recurring West Wing touchstone.');
