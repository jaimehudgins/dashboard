-- "Focus date": the day a task is intentionally chosen to work on (set at End
-- of Day, surfaced in the Morning Brief). Distinct from due_date.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS focus_date DATE;
