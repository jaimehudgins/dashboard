-- Slack alert/digest history and the morning snapshot used by the evening recap.
-- Run deliberately in the DASHBOARD Supabase project before enabling Slack sends.
CREATE TABLE IF NOT EXISTS leo_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL
    CHECK (kind IN ('urgent_email', 'workbench_ready', 'morning', 'evening', 'test')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  title TEXT,
  content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  slack_channel TEXT,
  slack_ts TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE leo_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access" ON leo_notifications;
CREATE POLICY "Allow all access" ON leo_notifications
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_leo_notifications_kind_sent
  ON leo_notifications(kind, sent_at DESC);

-- Reclassify a Gmail thread whenever its newest message changes. The alert
-- itself is deduplicated in leo_notifications by thread + message fingerprint.
ALTER TABLE IF EXISTS gmail_classifications
  ADD COLUMN IF NOT EXISTS confidence TEXT,
  ADD COLUMN IF NOT EXISTS message_fingerprint TEXT;
