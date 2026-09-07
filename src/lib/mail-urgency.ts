import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, isAnthropicConfigured } from "./anthropic";
import { supabase } from "./supabase";

export type Urgency = "now" | "question" | "later";

export interface UrgencyDecision {
  urgency: Urgency;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface UrgencyRecord extends UrgencyDecision {
  messageFingerprint: string | null;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          urgency: { type: "string", enum: ["now", "question", "later"] },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["id", "urgency", "reason", "confidence"],
      },
    },
  },
  required: ["items"],
};

// Batched urgency classification over email previews. Returns id -> urgency.
export async function classifyUrgencyDetailed(
  threads: { id: string; from: string; subject: string; snippet: string }[],
): Promise<Map<string, UrgencyDecision>> {
  const out = new Map<string, UrgencyDecision>();
  if (threads.length === 0 || !isAnthropicConfigured) return out;

  const system = `You triage email urgency for a busy nonprofit education leader. For each message choose:
- "now": a classroom or implementation blocker, login/access/security issue, explicit same-day or next-day deadline, escalating frustration, repeated unanswered request, or another issue where delay could harm a partner relationship.
- "question": the sender is asking something or awaiting a reply, but a response can wait until the next response window.
- "later": FYI, no action needed.
Judge only from the sender, subject, and preview. Give a short plain-language reason. Use "now" sparingly and mark confidence low when the preview does not provide enough evidence.`;
  const lines = threads
    .map(
      (t) =>
        `id:${t.id} | from:${t.from} | subject:${t.subject} | preview:${(t.snippet || "").slice(0, 200)}`,
    )
    .join("\n");

  try {
    const resp = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: lines }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = resp.content.find((b) => b.type === "text");
    const parsed = JSON.parse(text && "text" in text ? text.text : "{}");
    for (const item of parsed.items || []) {
      if (item.id && item.urgency) {
        out.set(item.id, {
          urgency: item.urgency,
          reason: String(item.reason || "Classified from the email preview.").slice(
            0,
            500,
          ),
          confidence: item.confidence || "low",
        });
      }
    }
  } catch (err) {
    console.warn("Urgency classify error:", err);
  }
  return out;
}

// Compatibility helper for existing UI callers that only need the glyph.
export async function classifyUrgency(
  threads: { id: string; from: string; subject: string; snippet: string }[],
): Promise<Map<string, Urgency>> {
  const detailed = await classifyUrgencyDetailed(threads);
  return new Map(
    [...detailed.entries()].map(([id, decision]) => [id, decision.urgency]),
  );
}

export async function saveUrgency(map: Map<string, Urgency>): Promise<void> {
  if (map.size === 0) return;
  const rows = [...map.entries()].map(([thread_id, urgency]) => ({
    thread_id,
    urgency,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("gmail_classifications")
    .upsert(rows, { onConflict: "thread_id" });
  if (error) console.warn("saveUrgency:", error.message);
}

export async function saveUrgencyDecisions(
  decisions: Map<string, UrgencyDecision>,
  fingerprints: Map<string, string>,
): Promise<void> {
  if (decisions.size === 0) return;
  const rows = [...decisions.entries()].map(([threadId, decision]) => ({
    thread_id: threadId,
    urgency: decision.urgency,
    reason: decision.reason,
    confidence: decision.confidence,
    message_fingerprint: fingerprints.get(threadId) ?? null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("gmail_classifications")
    .upsert(rows, { onConflict: "thread_id" });
  if (error) console.warn("saveUrgencyDecisions:", error.message);
}

export async function fetchUrgencyRecords(
  threadIds: string[],
): Promise<Record<string, UrgencyRecord>> {
  if (threadIds.length === 0) return {};
  const { data, error } = await supabase
    .from("gmail_classifications")
    .select("thread_id, urgency, reason, confidence, message_fingerprint")
    .in("thread_id", threadIds);
  if (error) return {};
  const out: Record<string, UrgencyRecord> = {};
  for (const row of data || []) {
    out[row.thread_id] = {
      urgency: row.urgency as Urgency,
      reason: row.reason || "Classified from the email preview.",
      confidence: row.confidence || "low",
      messageFingerprint: row.message_fingerprint || null,
    };
  }
  return out;
}

export async function fetchUrgency(
  threadIds: string[],
): Promise<Record<string, Urgency>> {
  if (threadIds.length === 0) return {};
  const { data, error } = await supabase
    .from("gmail_classifications")
    .select("thread_id, urgency")
    .in("thread_id", threadIds);
  if (error) return {};
  const out: Record<string, Urgency> = {};
  for (const r of data || []) out[r.thread_id] = r.urgency as Urgency;
  return out;
}
