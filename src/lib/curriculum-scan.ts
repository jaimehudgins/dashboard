import type Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import { anthropic, isAnthropicConfigured } from "./anthropic";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    references: {
      type: "array",
      description:
        "Curriculum lessons/units discussed in this partner meeting, with how they're landing. Empty if none.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lesson_ref: {
            type: "string",
            description:
              "The lesson or unit named (e.g. 'Unit 3', 'Who Am I?', '9th grade onboarding').",
          },
          sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
          note: { type: "string", description: "What was said about it." },
          quote: { type: "string", description: "Short supporting quote." },
        },
        required: ["lesson_ref", "sentiment", "note", "quote"],
      },
    },
  },
  required: ["references"],
};

// Mine partner meeting transcripts/summaries for curriculum signal.
export async function scanCurriculumSignal(): Promise<{
  meetings: number;
  signals: number;
}> {
  if (!isAnthropicConfigured) return { meetings: 0, signals: 0 };

  // Partner-linked meetings (via the partner tag on extracted tasks).
  const { data: tagged } = await supabase
    .from("granola_extracted_tasks")
    .select("meeting_id, partner_id, partner_name")
    .not("partner_id", "is", null);
  const partnerByMeeting = new Map<
    string,
    { partner_id: string; partner_name: string }
  >();
  for (const t of tagged || []) {
    if (!partnerByMeeting.has(t.meeting_id as string))
      partnerByMeeting.set(t.meeting_id as string, {
        partner_id: t.partner_id as string,
        partner_name: t.partner_name as string,
      });
  }

  // Skip meetings already scanned.
  const { data: done } = await supabase
    .from("curriculum_signals")
    .select("meeting_id");
  const scanned = new Set((done || []).map((d) => d.meeting_id as string));

  const meetingIds = [...partnerByMeeting.keys()].filter(
    (id) => !scanned.has(id),
  );
  let signals = 0;
  let meetings = 0;

  for (const mid of meetingIds.slice(0, 25)) {
    const { data: m } = await supabase
      .from("granola_meetings")
      .select("title, summary, meeting_date")
      .eq("id", mid)
      .maybeSingle();
    if (!m) continue;
    const { data: tr } = await supabase
      .from("granola_transcripts")
      .select("transcript")
      .eq("meeting_id", mid)
      .maybeSingle();
    const text = `Summary:\n${(m.summary as string) || ""}\n\nTranscript:\n${(
      (tr?.transcript as string) || ""
    ).slice(0, 12000)}`;
    meetings++;

    const partner = partnerByMeeting.get(mid)!;
    let refs: any[] = [];
    try {
      const resp = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1200,
        system: `You extract curriculum signal from a partner meeting. Identify any Willow curriculum lessons, units, or modules that were discussed (by name or number) and how they are landing with this partner — positive (working, praised, requested more), negative (struggling, confusing, skipped, criticized), or neutral. Only include real curriculum references, not generic platform talk. Empty if none.`,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: text }],
      } as Anthropic.MessageCreateParamsNonStreaming);
      const t = resp.content.find((b) => b.type === "text");
      const parsed = JSON.parse(t && "text" in t ? t.text : "{}");
      refs = Array.isArray(parsed.references) ? parsed.references : [];
    } catch (err) {
      console.warn("curriculum scan:", mid, (err as Error).message);
      continue;
    }

    if (refs.length === 0) {
      // Insert a placeholder so we don't re-scan an empty meeting forever.
      await supabase.from("curriculum_signals").upsert(
        {
          meeting_id: mid,
          partner_id: partner.partner_id,
          partner_name: partner.partner_name,
          lesson_ref: "—",
          sentiment: "neutral",
          note: "No curriculum references.",
          meeting_date: m.meeting_date,
        },
        { onConflict: "meeting_id,lesson_ref", ignoreDuplicates: true },
      );
      continue;
    }

    const rows = refs.map((r) => ({
      meeting_id: mid,
      partner_id: partner.partner_id,
      partner_name: partner.partner_name,
      lesson_ref: String(r.lesson_ref).slice(0, 120),
      sentiment: r.sentiment,
      note: r.note || null,
      quote: r.quote || null,
      meeting_date: m.meeting_date,
    }));
    const { error } = await supabase
      .from("curriculum_signals")
      .upsert(rows, { onConflict: "meeting_id,lesson_ref", ignoreDuplicates: true });
    if (!error) signals += rows.length;
  }

  return { meetings, signals };
}
