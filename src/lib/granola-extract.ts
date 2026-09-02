import type Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import { crmSupabase, isCrmConfigured } from "./crm-supabase";
import { anthropic, isAnthropicConfigured } from "./anthropic";

// Margaret sources task candidates from Granola's own "Next Steps" section
// (accurate, owner-attributed, no transcript re-derivation). A tiny Claude call
// identifies the CRM partner so a Task can route to the team-visible CRM.

// Willow staff email domain — attendees here are internal, not partners.
const INTERNAL_DOMAIN = "willowed.org";

// Temporary catch-up boundary requested by Jaime. Meetings before the start
// of Aug 20, 2026 in America/Chicago remain searchable context, but their
// historical next steps should not enter the active review queue.
const REVIEW_CUTOFF = new Date("2026-08-20T05:00:00.000Z");

interface PartnerRef {
  id: string;
  name: string;
}

interface Attendee {
  name: string;
  email?: string;
}

async function fetchPartners(): Promise<PartnerRef[]> {
  if (!isCrmConfigured) return [];
  const { data, error } = await crmSupabase
    .from("partners")
    .select("id, name")
    .order("name");
  if (error) {
    console.warn("granola fetchPartners:", error.message);
    return [];
  }
  return (data || []).map((p) => ({ id: p.id as string, name: p.name as string }));
}

function matchPartner(name: string, partners: PartnerRef[]): PartnerRef | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return (
    partners.find((p) => p.name.toLowerCase() === n) ||
    partners.find(
      (p) =>
        p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()),
    ) ||
    null
  );
}

/* ------------------------- Next Steps parsing ------------------------- */

interface NextStep {
  text: string;
  detail: string;
}

function cleanLine(s: string): string {
  return s
    .replace(/\*\*/g, "")
    .replace(/^[-*]\s+/, "")
    .replace(/\\([_~*])/g, "$1")
    .trim();
}

const SHARED_OWNERS = new Set(["team", "all", "everyone", "both", "group", "us"]);

function isMine(owner: string | null): boolean {
  if (!owner) return true; // unattributed → keep
  if (/jaime|jh\b/.test(owner)) return true;
  return SHARED_OWNERS.has(owner); // shared items include Jaime
}

// Pull the "Next Steps" (incl. "Handoff and Next Steps") section out of a
// Granola summary and return the bullets owned by Jaime or unattributed.
// `attendeeNames` (lowercased first names) disambiguate a "Name:" prefix owner
// from an ordinary "Word:" lead-in like "Timing:".
// Accept a header that is genuinely a next-steps/action-items section, not a
// compound one like "Platform Management & Next Steps" or "Handoff and Next
// Steps" (those tend to hold status/context, not action items).
function isNextStepsHeader(line: string): boolean {
  const h = line.match(/^#{1,6}\s+(.+?)\s*$/);
  if (!h) return false;
  const t = h[1]
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [
    "next steps",
    "action items",
    "follow ups",
    "follow up",
    "todos",
    "to dos",
    "next steps and action items",
    "action items and next steps",
    "next steps action items",
  ].includes(t);
}

function parseNextSteps(summary: string, attendeeNames: Set<string>): NextStep[] {
  if (!summary) return [];
  const lines = summary.split("\n");
  const startIdx = lines.findIndex(isNextStepsHeader);
  if (startIdx < 0) return [];

  // Section runs until the next header.
  const section: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) break;
    section.push(lines[i]);
  }

  const steps: NextStep[] = [];
  let current: { main: string; detail: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    // Clean markdown FIRST so a bold-wrapped owner tag like
    // "**Build … (Priscilla)**" ends in ")" and is detectable.
    let main = cleanLine(current.main);
    let owner: string | null = null;

    // Suffix owner "(Name)" — only if it looks like a name (≤3 words, no comma).
    const suffix = main.match(/\(([^)]+)\)\s*$/);
    if (suffix) {
      const inside = suffix[1].trim();
      if (!inside.includes(",") && inside.split(/\s+/).length <= 3) {
        owner = inside.toLowerCase();
        main = main.replace(/\(([^)]+)\)\s*$/, "").trim();
      }
    }
    // Prefix owner "Name:" — only when the word matches an attendee / shared
    // word (so "Timing:" or "Curriculum:" stay part of the text).
    if (!owner) {
      const prefix = main.match(/^([A-Za-z][\w.]*(?:\s+[A-Za-z][\w.]*)?):\s+/);
      if (prefix) {
        const cand = prefix[1].trim().toLowerCase();
        const candFirst = cand.split(/\s+/)[0];
        // Tolerate spelling variants (Priscilla vs Priscila) with a 4-char
        // prefix match against attendees — while keeping topic lead-ins like
        // "Timing:"/"Platform:" as text.
        const matchesAttendee =
          candFirst.length >= 3 &&
          [...attendeeNames].some(
            (a) => a.length >= 3 && a.slice(0, 4) === candFirst.slice(0, 4),
          );
        if (matchesAttendee || /jaime/.test(cand) || SHARED_OWNERS.has(candFirst)) {
          owner = cand;
          main = main.replace(prefix[0], "");
        }
      }
    }

    if (isMine(owner)) {
      const text = cleanLine(main);
      if (text) {
        steps.push({
          text,
          detail: current.detail
            .map((d) => cleanLine(d))
            .filter(Boolean)
            .join(" ")
            .slice(0, 400),
        });
      }
    }
    current = null;
  };

  for (const raw of section) {
    // Only a column-0 bullet starts a new item; indented lines (incl. nested
    // sub-bullets) are detail of the current item.
    const topBullet = /^[-*]\s+/.test(raw);
    if (topBullet) {
      flush();
      current = { main: raw.trim(), detail: [] };
    } else if (current && raw.trim()) {
      current.detail.push(raw.trim());
    }
  }
  flush();
  return steps;
}

/* ------------------------- Partner identification ------------------------- */

const PARTNER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    partner_name: {
      type: "string",
      description:
        "The exact partner name from the roster this meeting is with, or an empty string if none match.",
    },
  },
  required: ["partner_name"],
};

// Tiny Claude call: given external attendees + the roster, which partner is
// this? Only runs when an external (non-Willow) attendee is present.
async function identifyPartner(
  attendees: Attendee[],
  partners: PartnerRef[],
): Promise<PartnerRef | null> {
  const external = attendees.filter(
    (a) => a.email && !a.email.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`),
  );
  if (external.length === 0 || partners.length === 0 || !isAnthropicConfigured)
    return null;

  const roster = partners.map((p) => `- ${p.name}`).join("\n");
  const who = external.map((a) => a.email || a.name).join(", ");
  const system = `Given external meeting attendees and a roster of Willow's partner organizations, return the EXACT partner name (from the roster) this meeting is with, matching by the attendee's email domain / organization. If none match, return an empty string.`;
  const user = `External attendees: ${who}\n\nPartner roster:\n${roster}`;

  try {
    const resp = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 120,
      system,
      output_config: { format: { type: "json_schema", schema: PARTNER_SCHEMA } },
      messages: [{ role: "user", content: user }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = resp.content.find((b) => b.type === "text");
    const parsed = JSON.parse(text && "text" in text ? text.text : "{}");
    return matchPartner(
      typeof parsed.partner_name === "string" ? parsed.partner_name : "",
      partners,
    );
  } catch (err) {
    console.warn("granola identifyPartner:", (err as Error).message);
    return null;
  }
}

/* ------------------------------ Pipeline ------------------------------ */

// Build task candidates from Granola's Next Steps for meetings not yet
// processed. Candidates land as status "pending" for the user to route.
export async function extractPendingMeetings(
  max = 15,
): Promise<{ processed: number; tasksFound: number }> {
  const { data: meetings } = await supabase
    .from("granola_meetings")
    .select("id, title, summary, attendees, meeting_date, tasks_extracted")
    .eq("tasks_extracted", false)
    .order("meeting_date", { ascending: false })
    .limit(max);
  if (!meetings || meetings.length === 0) return { processed: 0, tasksFound: 0 };

  const partners = await fetchPartners();
  let processed = 0;
  let tasksFound = 0;

  for (const m of meetings) {
    // Atomically CLAIM the meeting so overlapping runs can't double-process.
    const { data: claimed } = await supabase
      .from("granola_meetings")
      .update({ tasks_extracted: true })
      .eq("id", m.id)
      .eq("tasks_extracted", false)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const unclaim = () =>
      supabase
        .from("granola_meetings")
        .update({ tasks_extracted: false })
        .eq("id", m.id);

    const meetingDate = m.meeting_date
      ? new Date(m.meeting_date as string)
      : null;
    if (
      meetingDate &&
      !Number.isNaN(meetingDate.getTime()) &&
      meetingDate < REVIEW_CUTOFF
    ) {
      processed++;
      continue;
    }

    const attendees = (m.attendees as Attendee[]) || [];
    const attendeeNames = new Set(
      attendees
        .map((a) => (a.name || "").trim().split(/\s+/)[0].toLowerCase())
        .filter(Boolean),
    );
    const steps = parseNextSteps((m.summary as string) || "", attendeeNames);
    if (steps.length === 0) {
      // No Next Steps section / nothing owned by Jaime — stays claimed.
      processed++;
      continue;
    }

    const partner = await identifyPartner(attendees, partners);

    const rows = steps.map((s) => ({
      meeting_id: m.id,
      task: s.text,
      due_date: null as string | null,
      partner_id: partner?.id ?? null,
      partner_name: partner?.name ?? null,
      source_quote: s.detail || null,
      confidence: "high",
      suggested_destination: "task",
      status: "pending",
    }));

    const { error } = await supabase
      .from("granola_extracted_tasks")
      .insert(rows);
    if (error) {
      console.warn("granola insert tasks:", m.id, error.message);
      await unclaim(); // release so it retries next run
      continue;
    }
    tasksFound += rows.length;
    processed++;
  }

  return { processed, tasksFound };
}
