-- Leo persistent memory (Phase 0; populated in Phase 3)
-- Structured facts organized by entity. See Leo Upgrades/leo-build-plan.md §Memory model.
CREATE TABLE memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,           -- 'partner', 'project', 'person', 'topic', 'global'
  entity_id TEXT,                      -- partner_id, project_id, person_email, etc.
  fact TEXT NOT NULL,
  source_conversation_id UUID,
  source_quote TEXT,
  importance INTEGER DEFAULT 5,        -- 1-10
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ               -- optional, for time-sensitive memories
);

-- Enable RLS
ALTER TABLE memory ENABLE ROW LEVEL SECURITY;

-- Allow all operations with anon key (single-user dashboard; NextAuth is the gate)
CREATE POLICY "Allow all access" ON memory
  FOR ALL USING (true) WITH CHECK (true);

-- Index for common lookups by entity
CREATE INDEX idx_memory_entity ON memory(entity_type, entity_id);
