-- Private Slack DM request history for Leo. Run deliberately in dashboard Supabase.
CREATE TABLE IF NOT EXISTS leo_slack_requests (
  event_id TEXT PRIMARY KEY,
  slack_user_id TEXT NOT NULL,
  slack_channel TEXT NOT NULL,
  message_ts TEXT NOT NULL,
  request_text TEXT NOT NULL,
  response_text TEXT,
  response_slack_ts TEXT,
  tools_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE leo_slack_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access" ON leo_slack_requests;
CREATE POLICY "Allow all access" ON leo_slack_requests
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_leo_slack_requests_channel_created
  ON leo_slack_requests(slack_channel, created_at DESC);
