-- Leo Workbench: one current preparation run per dashboard task.
-- Run deliberately in the DASHBOARD Supabase project before enabling the UI.
CREATE TABLE IF NOT EXISTS work_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL UNIQUE,
  task_title TEXT NOT NULL,
  task_description TEXT,
  workstream TEXT NOT NULL DEFAULT 'unassigned'
    CHECK (workstream IN ('curriculum', 'partner', 'leadership', 'unassigned')),
  deliverable_type TEXT NOT NULL DEFAULT 'assessment'
    CHECK (deliverable_type IN ('assessment', 'draft', 'context_packet', 'human_only')),
  status TEXT NOT NULL DEFAULT 'researching'
    CHECK (status IN ('researching', 'needs_input', 'draft_ready', 'reviewed', 'failed', 'human_only')),
  confidence TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence IN ('high', 'medium', 'low')),
  rationale TEXT,
  blocking_question TEXT,
  draft_title TEXT,
  draft TEXT,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  notification_tier TEXT NOT NULL DEFAULT 'none'
    CHECK (notification_tier IN ('immediate', 'digest', 'none')),
  notification_reason TEXT,
  notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE work_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access" ON work_runs;
CREATE POLICY "Allow all access" ON work_runs
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_work_runs_status
  ON work_runs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_runs_notification
  ON work_runs(notification_tier, notification_sent_at, updated_at DESC);

