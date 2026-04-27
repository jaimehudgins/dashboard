-- Curriculum Lessons Tracker table
CREATE TABLE curriculum_lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grade TEXT NOT NULL,
  format TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  unit_number INTEGER NOT NULL,
  phase_name TEXT NOT NULL DEFAULT '',
  lesson_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  durable_skill TEXT NOT NULL DEFAULT '',
  student_work_product TEXT NOT NULL DEFAULT '',
  platform_action TEXT NOT NULL DEFAULT '',
  alma_integration TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Not Created',
  notes TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE curriculum_lessons ENABLE ROW LEVEL SECURITY;

-- Allow all operations with anon key (single-user dashboard)
CREATE POLICY "Allow all access" ON curriculum_lessons
  FOR ALL USING (true) WITH CHECK (true);

-- Index for common queries
CREATE INDEX idx_curriculum_grade_format ON curriculum_lessons(grade, format);
CREATE INDEX idx_curriculum_status ON curriculum_lessons(status);
