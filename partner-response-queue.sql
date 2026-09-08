-- Run in LEO's Supabase SQL editor. Requires a server-only
-- SUPABASE_SERVICE_ROLE_KEY in Leo (never NEXT_PUBLIC_*).
BEGIN;

CREATE TABLE IF NOT EXISTS public.partner_responses (
  thread_id TEXT PRIMARY KEY,
  partner_id TEXT,
  partner_name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  sender TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  message_id TEXT NOT NULL,
  received_at TIMESTAMPTZ,
  in_inbox BOOLEAN NOT NULL DEFAULT true,
  urgency TEXT NOT NULL DEFAULT 'question' CHECK (urgency IN ('now', 'question', 'later')),
  confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('high', 'medium', 'low')),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'needs_response'
    CHECK (status IN ('needs_response', 'draft_ready', 'needs_input', 'waiting', 'handled')),
  notes TEXT NOT NULL DEFAULT '',
  follow_up_on DATE,
  draft TEXT NOT NULL DEFAULT '',
  draft_message_id TEXT,
  draft_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_responses_status_date
  ON public.partner_responses(status, received_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_response_revisions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES public.partner_responses(thread_id),
  draft TEXT NOT NULL,
  message_id TEXT,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_mail_sync (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  history_id TEXT,
  page_token TEXT,
  pending_thread_ids TEXT[],
  pending_history_id TEXT,
  pending_mode TEXT,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  lock_id UUID,
  lock_until TIMESTAMPTZ,
  last_mode TEXT,
  changed_count INTEGER NOT NULL DEFAULT 0
);
INSERT INTO public.partner_mail_sync(id) VALUES ('primary') ON CONFLICT DO NOTHING;

-- NextAuth protects the API. These private tables must not be accessible with
-- the public browser Supabase key. Only the server service role can use them.
ALTER TABLE public.partner_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_response_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_mail_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_responses, public.partner_response_revisions, public.partner_mail_sync FROM anon, authenticated;
GRANT ALL ON public.partner_responses, public.partner_response_revisions, public.partner_mail_sync TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.partner_response_revisions_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.version_partner_response() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.draft <> '' AND (OLD.draft IS DISTINCT FROM NEW.draft OR OLD.draft_message_id IS DISTINCT FROM NEW.draft_message_id) THEN
    INSERT INTO public.partner_response_revisions(thread_id, draft, message_id, sources)
    VALUES (OLD.thread_id, OLD.draft, OLD.draft_message_id, OLD.draft_sources);
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS version_partner_response ON public.partner_responses;
CREATE TRIGGER version_partner_response BEFORE UPDATE ON public.partner_responses
  FOR EACH ROW EXECUTE FUNCTION public.version_partner_response();

-- One manual or cron sync at a time, including across Vercel instances.
CREATE OR REPLACE FUNCTION public.claim_partner_mail_sync(claim_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.partner_mail_sync SET lock_id = claim_id, lock_until = now() + interval '6 minutes'
  WHERE id = 'primary' AND (lock_until IS NULL OR lock_until < now());
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_partner_mail_sync(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_partner_mail_sync(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.version_partner_response() FROM PUBLIC, anon, authenticated;
COMMIT;
