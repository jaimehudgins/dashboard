import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, isAnthropicConfigured } from "./anthropic";
import { supabase } from "./supabase";

export type Urgency = "now" | "question" | "later";

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
        },
        required: ["id", "urgency"],
      },
    },
  },
  required: ["items"],
};

// Batched urgency classification over email previews. Returns id -> urgency.
export async function classifyUrgency(
  threads: { id: string; from: string; subject: string; snippet: string }[],
): Promise<Map<string, Urgency>> {
  const out = new Map<string, Urgency>();
  if (threads.length === 0 || !isAnthropicConfigured) return out;

  const system = `You triage email urgency for a busy nonprofit leader. For each message choose:
- "now": time-sensitive or a decision/commitment/scheduling is being asked of them — they'll want to act soon.
- "question": the sender is asking something or awaiting their reply, but it isn't urgent.
- "later": FYI, no action needed.
Judge from the sender, subject, and preview.`;
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
    for (const i of parsed.items || []) {
      if (i.id && i.urgency) out.set(i.id, i.urgency);
    }
  } catch (err) {
    console.warn("Urgency classify error:", err);
  }
  return out;
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
