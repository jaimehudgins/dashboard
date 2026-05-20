-- Adds the recurrence_days_of_week column to the tasks table.
-- Stores 0..6 integers (Sun..Sat) for weekly/biweekly recurrence days.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_days_of_week jsonb;
