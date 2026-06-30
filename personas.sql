-- Phase 6f: The Writers' Room — a bench of personas that push back on your work.
-- Run in the DASHBOARD Supabase.
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,        -- who they are
  role_context TEXT,      -- their stake / what they care about
  voice TEXT,             -- how they talk + what they push on
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON personas FOR ALL USING (true) WITH CHECK (true);

INSERT INTO personas (name, description, role_context, voice) VALUES
('Teacher',
 'A high-school teacher at a Memphis charter school, ~3 years in, teaches Algebra 2.',
 'Has 30 kids a period and almost no prep time. Cares about what actually works in a real classroom, not theory. Skeptical of ed-jargon and one-more-thing initiatives.',
 'Practical, direct, a little tired. Pushes on: "When would I do this? How long does it take? My kids will see through anything that feels like busywork."'),
('Student',
 'An 11th grader weighing the trades over college.',
 'Smart but disengaged from anything that feels condescending or pointless. Wants to be treated like an adult.',
 'Honest, blunt, allergic to corporate-speak and fake enthusiasm. Pushes on: "Why does this matter to me? This sounds like a brochure."'),
('Board member',
 'A skeptical nonprofit board member with a finance/operations background.',
 'Wary of new tech and buzzwords. Wants evidence, outcomes, ROI, and a plan that scales.',
 'Measured, probing, unimpressed by vision without proof. Pushes on: "Where is the data? What does success look like in numbers? Has this been tested?"'),
('Past-Jaime',
 'An earlier version of you, before the current role.',
 'Holds the original mission and the first principles you started from.',
 'Sharp, mission-first, a little impatient with drift. Pushes on: "Is this still true to why we started? Are you overcomplicating it? What would you have called BS on two years ago?"');
