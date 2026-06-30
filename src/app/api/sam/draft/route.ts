import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { getSentSamples } from "@/lib/gmail";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";
import { crmSupabase, isCrmConfigured } from "@/lib/crm-supabase";
import { meetingsForPartner } from "@/lib/granola-search";

export const maxDuration = 60;

// Voice samples for Sam: prefer the user's own published writing; fall back to
// recent sent emails so there's always a voice to match.
async function voiceSamples(token: string): Promise<string> {
  const { data } = await supabase
    .from("writing_drafts")
    .select("content")
    .in("status", ["published", "ready_to_publish"])
    .order("updated_at", { ascending: false })
    .limit(5);
  let samples = (data || [])
    .map((d) => (d.content as string) || "")
    .filter((c) => c.trim().length > 120);
  if (samples.length < 2) {
    const sent = await getSentSamples(token, 3).catch(() => [] as string[]);
    samples = [...samples, ...sent];
  }
  return samples.length
    ? samples.map((s, i) => `--- Voice sample ${i + 1} ---\n${s}`).join("\n\n")
    : "(No samples available. Use a clear, direct, human voice.)";
}

// POST /api/sam/draft  { instruction, content?, audience?, partnerId? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAnthropicConfigured) {
    return NextResponse.json(
      { error: "Drafting is not configured (missing ANTHROPIC_API_KEY)." },
      { status: 500 },
    );
  }
  const token = session.accessToken;
  const name = session.user?.name || "Jaime";

  let body: {
    instruction?: string;
    content?: string;
    audience?: string;
    partnerId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.instruction?.trim()) {
    return NextResponse.json(
      { error: "Tell Sam what to write." },
      { status: 400 },
    );
  }

  try {
    const voice = await voiceSamples(token);

    // Optional grounding: a partner's CRM context + recent meetings.
    let context = "";
    if (body.partnerId && isCrmConfigured) {
      const { data: p } = await crmSupabase
        .from("partners")
        .select("name, status, summary, district, city_state")
        .eq("id", body.partnerId)
        .maybeSingle();
      if (p) {
        const meetings = await meetingsForPartner(body.partnerId, 3);
        context = `\n\nGround the writing in this real context (use it for substance; do not name-drop awkwardly):
Partner: ${p.name}${p.city_state ? ` (${p.city_state})` : ""} — status ${p.status}
${p.summary ? `Summary: ${p.summary}` : ""}
${
  meetings.length
    ? `Recent meetings:\n${meetings
        .map((m) => `- ${m.title}: ${(m.summary || "").slice(0, 300)}`)
        .join("\n")}`
    : ""
}`;
      }
    }

    const audience = body.audience ? ` The audience is ${body.audience}.` : "";
    const system = `You are Sam, ${name}'s speechwriter. You help ${name} write in public — posts, frameworks, half-formed thinking made sharp — in ${name}'s own voice, matching the tone, rhythm, and register of the writing samples below.${audience}

Rules:
- Write as ${name} (first person). Output ONLY the requested writing, in markdown. No preamble, no "here's a draft", no meta commentary.
- Sound like a real person, not AI: avoid em-dashes (use commas/periods); cut AI-tell filler and clichés ("here's the big picture", "in today's fast-paced", "let's dive in", "at the end of the day", "it's worth noting", "circle back", "game-changer", "unlock", "leverage" as a verb). No forced enthusiasm, no rule-of-three padding.
- Match the voice samples. If they're plain and direct, be plain and direct.
- Substance over fluff. Don't invent facts, numbers, or quotes. Use [brackets] where ${name} needs to fill something in.

${name}'s writing voice samples:
${voice}`;

    const userPrompt = `Instruction: ${body.instruction.trim()}${
      body.content?.trim()
        ? `\n\nCurrent draft (work from this):\n${body.content.trim()}`
        : ""
    }${context}`;

    const resp = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: userPrompt }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) {
      return NextResponse.json(
        { error: "Sam couldn't produce anything. Try again." },
        { status: 502 },
      );
    }
    return NextResponse.json({ text });
  } catch (err) {
    console.error("Sam draft error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Draft failed" },
      { status: 500 },
    );
  }
}
