import type Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import { crmSupabase, isCrmConfigured } from "./crm-supabase";
import { anthropic, isAnthropicConfigured } from "./anthropic";

// Claude returns, per meeting, which partner it was with (from the roster) and
// the commitments Jaime made.
const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    partner_name: {
      type: "string",
      description:
        "The exact partner name from the provided roster this meeting was with, or an empty string if none apply.",
    },
    tasks: {
      type: "array",
      description:
        "Items worth capturing from this meeting (commitments, decisions, ideas). Empty if none.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          task: {
            type: "string",
            description:
              "The item as a short, imperative line (e.g. 'Send Ryan the vision doc').",
          },
          due_date: {
            type: "string",
            description:
              "ISO date YYYY-MM-DD if a deadline was stated or clearly implied, else empty string.",
          },
          source_quote: {
            type: "string",
            description: "The short transcript line this was drawn from.",
          },
          confidence: {
            type: "string",
            enum: ["high", "low"],
            description:
              "high = an explicit, concrete commitment Jaime clearly owns; low = sounds like an action but is hypothetical, vague, or possibly someone else's.",
          },
          suggested_destination: {
            type: "string",
            enum: ["task", "quick_task", "backlog", "ignore"],
            description:
              "Best home: task = a real to-do Jaime owns with weight; quick_task = a small/quick to-do; backlog = an idea or maybe-someday floated, worth parking for later; ignore = not worth keeping.",
          },
        },
        required: [
          "task",
          "due_date",
          "source_quote",
          "confidence",
          "suggested_destination",
        ],
      },
    },
  },
  required: ["partner_name", "tasks"],
};

// Willow staff email domain — attendees here are internal, not partners.
const INTERNAL_DOMAIN = "willowed.org";

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

interface ExtractedItem {
  task: string;
  due_date: string;
  source_quote: string;
  confidence: "high" | "low";
  suggested_destination: "task" | "quick_task" | "backlog" | "ignore";
}

interface ExtractResult {
  partnerName: string;
  tasks: ExtractedItem[];
}

async function extractFromTranscript(
  meeting: { title: string; summary: string; attendees: Attendee[] },
  transcript: string,
  partners: PartnerRef[],
  todayISO: string,
): Promise<ExtractResult | null> {
  if (!isAnthropicConfigured) return null;

  const roster = partners.length
    ? partners.map((p) => `- ${p.name}`).join("\n")
    : "(no partners on file)";
  const attendees =
    meeting.attendees
      .map((a) => (a.email ? `${a.name} <${a.email}>` : a.name))
      .filter(Boolean)
      .join(", ") || "unknown";

  const system = `You are Margaret, the meeting-notes agent for Jaime, a partnerships/curriculum lead at Willow. You read a meeting transcript and surface only the items that need to LEAVE the meeting — actions Jaime should take and ideas worth parking — then CLASSIFY each. In the transcript, Jaime's own words are labeled "Jaime:" and everyone else is "Them:".

IMPORTANT: Do NOT extract facts, contacts, numbers, decisions, or context just to "remember" them — those already live in the meeting summary, which is saved and searchable. Only surface things that require an action or are a forward-looking idea to revisit. A meeting with nothing to act on returns an empty array.

For EACH item set:
- confidence: "high" only for an explicit, concrete commitment Jaime clearly owns; otherwise "low".
- suggested_destination — the single best home:
  - "task": a real to-do Jaime owns with weight (e.g. "Send Ryan the vision doc").
  - "quick_task": a small, quick to-do.
  - "backlog": an idea or maybe-someday possibility floated, worth parking to revisit later (e.g. "Could add a training-school flow eventually").
  - "ignore": not worth keeping.
- Do NOT force things into tasks. If something only "sounds like" a task but is hypothetical or vague, mark it low confidence; if it's a someday-idea, route it to backlog; if it's neither an action nor a real idea, ignore it.
- task: phrase the item as a short imperative line.
- due_date: only when a deadline is stated or clearly implied (resolve relative dates against today, ${todayISO}); otherwise empty string.
- source_quote: the short line it came from.

partner_name (meeting-level): ONLY set it when an EXTERNAL attendee (email NOT @${INTERNAL_DOMAIN}) belongs to one of the partner organizations below — return that partner's EXACT name. Meetings with only Willow staff (all @${INTERNAL_DOMAIN}) are internal: return an empty string. When unsure, empty string.

Willow CRM partner roster:
${roster}`;

  const user = `Meeting: ${meeting.title}
Attendees: ${attendees}

Summary:
${(meeting.summary || "(none)").slice(0, 2000)}

Transcript:
${transcript.slice(0, 16000)}`;

  try {
    const resp = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      system,
      output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
      messages: [{ role: "user", content: user }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = resp.content.find((b) => b.type === "text");
    const parsed = JSON.parse(text && "text" in text ? text.text : "{}");
    return {
      partnerName: typeof parsed.partner_name === "string" ? parsed.partner_name : "",
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch (err) {
    console.warn("granola extract:", (err as Error).message);
    return null;
  }
}

function matchPartner(
  name: string,
  partners: PartnerRef[],
): PartnerRef | null {
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

// Extract tasks for meetings that have a transcript but haven't been processed.
// Confirm-gated: tasks land as status "pending" for the user to review.
export async function extractPendingMeetings(
  max = 15,
): Promise<{ processed: number; tasksFound: number }> {
  if (!isAnthropicConfigured) return { processed: 0, tasksFound: 0 };

  const { data: meetings } = await supabase
    .from("granola_meetings")
    .select("id, title, summary, attendees, tasks_extracted")
    .eq("tasks_extracted", false)
    .order("meeting_date", { ascending: false })
    .limit(max);
  if (!meetings || meetings.length === 0) return { processed: 0, tasksFound: 0 };

  const partners = await fetchPartners();
  const todayISO = new Date().toISOString().slice(0, 10);
  let processed = 0;
  let tasksFound = 0;

  for (const m of meetings) {
    const { data: tr } = await supabase
      .from("granola_transcripts")
      .select("transcript")
      .eq("meeting_id", m.id)
      .maybeSingle();
    const transcript = (tr?.transcript as string) || "";
    if (!transcript) {
      // No transcript to work from — mark processed so we don't loop on it.
      await supabase
        .from("granola_meetings")
        .update({ tasks_extracted: true })
        .eq("id", m.id);
      processed++;
      continue;
    }

    const attendees = (m.attendees as Attendee[]) || [];
    const result = await extractFromTranscript(
      {
        title: (m.title as string) || "",
        summary: (m.summary as string) || "",
        attendees,
      },
      transcript,
      partners,
      todayISO,
    );
    if (!result) continue; // leave unprocessed to retry next run

    // Backstop: only allow a partner match if an external (non-Willow)
    // attendee was present — internal staff meetings never link to a partner.
    const hasExternal = attendees.some(
      (a) =>
        a.email &&
        !a.email.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`),
    );
    const partner = hasExternal
      ? matchPartner(result.partnerName, partners)
      : null;
    const rows = result.tasks
      .filter((t) => t.task && t.task.trim())
      // Drop pure noise; everything else is a routable candidate.
      .filter((t) => t.suggested_destination !== "ignore")
      .map((t) => {
        const dest =
          t.suggested_destination === "task" && partner
            ? "task" // partner routing handled at confirm time
            : t.suggested_destination;
        return {
          meeting_id: m.id,
          task: t.task.trim(),
          due_date: /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null,
          partner_id: partner?.id ?? null,
          partner_name: partner?.name ?? null,
          source_quote: t.source_quote || null,
          confidence: t.confidence === "high" ? "high" : "low",
          suggested_destination: dest,
          status: "pending",
        };
      });
    if (rows.length > 0) {
      const { error } = await supabase
        .from("granola_extracted_tasks")
        .insert(rows);
      if (error) {
        console.warn("granola insert tasks:", m.id, error.message);
        continue; // retry next run
      }
      tasksFound += rows.length;
    }
    await supabase
      .from("granola_meetings")
      .update({ tasks_extracted: true })
      .eq("id", m.id);
    processed++;
  }

  return { processed, tasksFound };
}
