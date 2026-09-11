-- Run in Leo's Supabase SQL editor. No Drive files/comments are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.leo_comment_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Decisions apply only to the exact version reviewed. New replies, edits,
-- or reopening in Drive bring a comment back to Review automatically.
CREATE TABLE IF NOT EXISTS public.leo_comment_decisions (
  file_id TEXT NOT NULL REFERENCES public.leo_comment_files(id),
  comment_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('review', 'needs_response', 'no_action')),
  PRIMARY KEY (file_id, comment_id, revision)
);

-- A durable claim prevents duplicate external writes across tabs/retries.
-- An uncertain write stays claimed: inspect Drive, never blindly retry.
CREATE TABLE IF NOT EXISTS public.leo_comment_writes (
  file_id TEXT NOT NULL REFERENCES public.leo_comment_files(id),
  comment_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('reply', 'resolve')),
  payload_hash TEXT NOT NULL,
  reply_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, comment_id, revision)
);

ALTER TABLE public.leo_comment_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_comment_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_comment_writes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leo_comment_files, public.leo_comment_decisions, public.leo_comment_writes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.leo_comment_files, public.leo_comment_decisions, public.leo_comment_writes TO service_role;
COMMIT;
