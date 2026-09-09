-- Run AFTER partner-response-policy.sql in LEO's Supabase.
-- No rules are approved by this migration; no emails/tasks/drafts are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.partner_response_rules (
  id TEXT PRIMARY KEY,
  email_type TEXT NOT NULL CHECK (email_type IN ('meeting_acceptance', 'calendar_invitation', 'meeting_change', 'acknowledgment', 'platform_access', 'curriculum_question')),
  partner_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('reply_needed', 'action_only', 'waiting', 'no_reply', 'judgment')),
  guidance TEXT NOT NULL CHECK (length(guidance) BETWEEN 1 AND 800),
  active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (partner_id IS NULL OR length(partner_id) > 0),
  CHECK (id = coalesce(partner_id, 'global') || ':' || email_type)
);
ALTER TABLE public.partner_response_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_response_rules FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.partner_response_rules TO service_role;
CREATE OR REPLACE FUNCTION public.version_partner_response_rule() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS version_partner_response_rule ON public.partner_response_rules;
CREATE TRIGGER version_partner_response_rule BEFORE UPDATE ON public.partner_response_rules
FOR EACH ROW EXECUTE FUNCTION public.version_partner_response_rule();
REVOKE ALL ON FUNCTION public.version_partner_response_rule() FROM PUBLIC, anon, authenticated;
COMMIT;
