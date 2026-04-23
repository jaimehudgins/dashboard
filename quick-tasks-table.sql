CREATE TABLE quick_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task TEXT NOT NULL,
  due_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'complete')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quick_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON quick_tasks
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_quick_tasks_status ON quick_tasks(status);
CREATE INDEX idx_quick_tasks_due_date ON quick_tasks(due_date);
CREATE INDEX idx_quick_tasks_display_order ON quick_tasks(display_order);
