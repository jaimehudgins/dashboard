-- Phase 6e (CJ): field intelligence. Configurable RSS sources, and signals
-- pulled + scored for relevance. Run in the DASHBOARD Supabase.

CREATE TABLE field_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE field_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT UNIQUE,
  relevance INT DEFAULT 0,        -- 0–100
  tags TEXT[] DEFAULT '{}',
  saved BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE field_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON field_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON field_signals FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_field_signals_rel ON field_signals(relevance DESC, captured_at DESC);
