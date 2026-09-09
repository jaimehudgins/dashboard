-- Run AFTER partner-response-queue.sql and partner-response-preparation.sql
-- in LEO's Supabase. Additive; no email, task, or draft is deleted.
BEGIN;
ALTER TABLE public.partner_responses
  ADD COLUMN IF NOT EXISTS response_assessment JSONB,
  ADD COLUMN IF NOT EXISTS response_correction JSONB,
  ADD COLUMN IF NOT EXISTS response_assessment_retry_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.partner_response_feedback (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES public.partner_responses(thread_id),
  partner_id TEXT,
  subject TEXT NOT NULL,
  assessment JSONB,
  correction JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_response_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_response_feedback FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.partner_response_feedback TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.partner_response_feedback_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.record_partner_response_feedback() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.response_correction IS NOT NULL AND NEW.response_correction IS DISTINCT FROM OLD.response_correction THEN
    INSERT INTO public.partner_response_feedback(thread_id, partner_id, subject, assessment, correction)
    VALUES (NEW.thread_id, NEW.partner_id, NEW.subject, NEW.response_assessment, NEW.response_correction);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS record_partner_response_feedback ON public.partner_responses;
CREATE TRIGGER record_partner_response_feedback AFTER UPDATE ON public.partner_responses
FOR EACH ROW EXECUTE FUNCTION public.record_partner_response_feedback();
REVOKE ALL ON FUNCTION public.record_partner_response_feedback() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.partner_policy_state (
  id TEXT PRIMARY KEY CHECK (id = 'primary'),
  lock_id UUID,
  lock_until TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT
);
INSERT INTO public.partner_policy_state(id) VALUES ('primary') ON CONFLICT DO NOTHING;
ALTER TABLE public.partner_policy_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_policy_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.partner_policy_state TO service_role;

CREATE OR REPLACE FUNCTION public.claim_partner_policy(claim_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.partner_policy_state SET lock_id = claim_id, lock_until = now() + interval '4 minutes'
  WHERE id = 'primary' AND (lock_until IS NULL OR lock_until < now());
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_partner_policy(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_partner_policy(UUID) TO service_role;

-- Message-keyed backlog: human decisions and already assessed messages are
-- excluded. Errors retry on a later tick; order by updated_at avoids starvation.
CREATE OR REPLACE FUNCTION public.pending_partner_policy() RETURNS SETOF public.partner_responses
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT * FROM public.partner_responses
  WHERE in_inbox AND status NOT IN ('handled', 'waiting')
    AND (response_assessment_retry_at IS NULL OR response_assessment_retry_at <= now())
    AND (response_assessment->>'message_id') IS DISTINCT FROM message_id
    AND (response_correction->>'message_id') IS DISTINCT FROM message_id
  ORDER BY updated_at, thread_id LIMIT 2;
$$;
REVOKE ALL ON FUNCTION public.pending_partner_policy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_partner_policy() TO service_role;
COMMIT;
