-- Run in Leo's Supabase. Uses the existing tasks table; no tasks are created here.
BEGIN;
CREATE TABLE IF NOT EXISTS public.leo_slack_mentions (
  request_key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  slack_user_id TEXT NOT NULL,
  slack_channel TEXT NOT NULL,
  message_ts TEXT NOT NULL,
  thread_ts TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created', 'clarification', 'failed')),
  task_id TEXT,
  reply_text TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slack_channel, message_ts)
);
ALTER TABLE public.leo_slack_mentions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leo_slack_mentions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.leo_slack_mentions TO service_role;
COMMIT;
