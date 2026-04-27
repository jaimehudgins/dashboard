-- Area consolidation migration
-- Merges misc_categories + work_areas into a single `areas` table.
-- Run in stages. Stage 1 is non-destructive: it creates `areas`, adds
-- `tasks.area_id` and `projects.default_area_id`, and backfills.
-- Old columns/tables stay until Stage 2 (run after verification).

-- =====================================================================
-- AUDIT (run first; commits nothing)
-- =====================================================================

-- 1. Tasks that will land in "Unassigned" because they had conflicting
--    category_id / work_area_id values. These keep all their other data;
--    only their area assignment is cleared.
-- SELECT t.id, t.title,
--        w.name AS current_work_area,
--        m.name AS current_misc_category
-- FROM tasks t
-- LEFT JOIN work_areas w ON t.work_area_id = w.id
-- LEFT JOIN misc_categories m ON t.category_id = m.id
-- WHERE t.work_area_id IS NOT NULL
--   AND t.category_id IS NOT NULL
--   AND w.name <> m.name;

-- 2. Same-name entities across both source tables (these will merge into
--    a single Area row — desired outcome, listed for awareness).
-- SELECT w.name
-- FROM work_areas w
-- JOIN misc_categories m ON m.name = w.name;

-- =====================================================================
-- STAGE 1: create areas, add new columns, backfill (safe / reversible)
-- =====================================================================

-- NOTE: existing work_areas.id and misc_categories.id are TEXT, so areas.id
-- is TEXT to match (and so the INSERTs below preserve ids without casting).
CREATE TABLE areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  display_order INTEGER,
  is_collapsed BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON areas
  FOR ALL USING (true) WITH CHECK (true);

-- Seed: copy all work_areas verbatim (preserve ids so existing
-- tasks.work_area_id values still resolve in the backfill below).
INSERT INTO areas (id, name, color, display_order, created_at)
SELECT id, name, color, display_order, created_at
FROM work_areas;

-- Seed: copy misc_categories whose name is not already represented.
-- Same-name rows are intentionally merged into the work_areas-sourced row.
INSERT INTO areas (id, name, color, display_order, is_collapsed, created_at)
SELECT m.id, m.name, m.color, m.display_order, m.is_collapsed, m.created_at
FROM misc_categories m
WHERE NOT EXISTS (
  SELECT 1 FROM areas a WHERE a.name = m.name
);

-- New columns on tasks/projects.
ALTER TABLE tasks ADD COLUMN area_id TEXT REFERENCES areas(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN default_area_id TEXT REFERENCES areas(id) ON DELETE SET NULL;

-- Backfill tasks.area_id with conflict-safe rules:
--   only work_area_id set      -> use it directly
--   only category_id set       -> resolve via name match into areas
--   both set, names agree      -> use work_area_id
--   both set, names disagree   -> NULL (manual reassignment in app)
UPDATE tasks t SET area_id = CASE
  WHEN t.work_area_id IS NOT NULL AND t.category_id IS NULL
    THEN t.work_area_id
  WHEN t.category_id IS NOT NULL AND t.work_area_id IS NULL
    THEN (
      SELECT a.id FROM areas a
      JOIN misc_categories m ON a.name = m.name
      WHERE m.id = t.category_id
    )
  WHEN t.work_area_id IS NOT NULL AND t.category_id IS NOT NULL
       AND (SELECT w.name FROM work_areas w WHERE w.id = t.work_area_id)
         = (SELECT m.name FROM misc_categories m WHERE m.id = t.category_id)
    THEN t.work_area_id
  ELSE NULL
END;

CREATE INDEX idx_tasks_area_id ON tasks(area_id);
CREATE INDEX idx_projects_default_area_id ON projects(default_area_id);

-- =====================================================================
-- STAGE 2: drop legacy columns/tables
-- DO NOT RUN until the app has been switched over to area_id and you have
-- confirmed via the UI that nothing is missing. Take a backup first.
-- =====================================================================

-- ALTER TABLE tasks DROP COLUMN category_id;
-- ALTER TABLE tasks DROP COLUMN work_area_id;
-- DROP TABLE misc_categories;
-- DROP TABLE work_areas;
