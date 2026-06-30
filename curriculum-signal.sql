-- Phase 6g: Curriculum feedback loop. Curriculum signal mined from partner
-- meeting transcripts (which lessons/units come up, and how they're landing).
-- Run in the DASHBOARD Supabase.
CREATE TABLE curriculum_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id TEXT,
  partner_id TEXT,
  partner_name TEXT,
  lesson_ref TEXT NOT NULL,      -- e.g. "Unit 3", "Who Am I?"
  sentiment TEXT,                -- positive | neutral | negative
  note TEXT,                     -- what was said about it
  quote TEXT,
  meeting_date TIMESTAMPTZ,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (meeting_id, lesson_ref)
);
ALTER TABLE curriculum_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON curriculum_signals FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_curriculum_signals_lesson ON curriculum_signals(lesson_ref);
