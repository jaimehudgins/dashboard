-- Run AFTER partner-response-queue.sql in LEO's Supabase.
BEGIN;
ALTER TABLE public.partner_responses
  ADD COLUMN IF NOT EXISTS preparation_message_id TEXT,
  ADD COLUMN IF NOT EXISTS preparation_reason TEXT,
  ADD COLUMN IF NOT EXISTS preparation_batch_key TEXT;

CREATE TABLE IF NOT EXISTS public.partner_preparation_runs (
  batch_key TEXT PRIMARY KEY,
  window_label TEXT NOT NULL,
  cutoff_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'complete', 'superseded')),
  remaining_thread_ids TEXT[] NOT NULL DEFAULT '{}',
  considered INTEGER NOT NULL DEFAULT 0,
  prepared INTEGER NOT NULL DEFAULT 0,
  needs_input INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  lock_id UUID,
  lock_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_preparation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_preparation_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.partner_preparation_runs TO service_role;

CREATE OR REPLACE FUNCTION public.claim_partner_preparation(
  requested_key TEXT, requested_label TEXT, requested_cutoff TIMESTAMPTZ, claim_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Serialize claims even across adjacent windows; a delayed earlier invocation
  -- must finish (or lose its lease) before another window begins drafting.
  PERFORM pg_advisory_xact_lock(731942011);
  IF EXISTS (
    SELECT 1 FROM public.partner_preparation_runs
    WHERE batch_key <> requested_key AND lock_until > now()
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.partner_preparation_runs(batch_key, window_label, cutoff_at, remaining_thread_ids, considered)
  SELECT requested_key, requested_label, requested_cutoff, COALESCE(array_agg(thread_id), '{}'), count(*)
  FROM (
    SELECT thread_id FROM public.partner_responses
    WHERE status = 'needs_response' AND in_inbox AND partner_id IS NOT NULL AND draft = ''
      AND preparation_message_id IS DISTINCT FROM message_id
      AND received_at <= requested_cutoff AND received_at >= requested_cutoff - interval '7 days'
    ORDER BY CASE urgency WHEN 'now' THEN 0 ELSE 1 END, received_at, thread_id
    LIMIT (CASE WHEN requested_label = '4:45 PM' THEN 4 ELSE 12 END)
  ) candidates
  ON CONFLICT (batch_key) DO NOTHING;

  UPDATE public.partner_preparation_runs
  SET lock_id = claim_id, lock_until = now() + interval '6 minutes', updated_at = now()
  WHERE batch_key = requested_key AND status = 'running'
    AND (lock_until IS NULL OR lock_until < now());
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_partner_preparation(TEXT, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_partner_preparation(TEXT, TEXT, TIMESTAMPTZ, UUID) TO service_role;
COMMIT;
