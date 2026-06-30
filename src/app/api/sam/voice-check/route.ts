import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: {
      type: "string",
      enum: ["on voice", "some drift", "off voice"],
    },
    summary: {
      type: "string",
      description: "One or two sentences on how the draft matches the voice.",
    },
    flags: {
      type: "array",
      description: "Specific spots that drift, with a fix. Empty if on-voice.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          quote: { type: "string", description: "The drifting phrase/line." },
          issue: { type: "string", description: "Why it drifts + the fix." },
        },
        required: ["quote", "issue"],
      },
    },
  },
  required: ["verdict", "summary", "flags"],
};

// POST /api/sam/voice-check  { content }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAnthropicConfigured) {
    return NextResponse.json(
      { error: "Voice check needs ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.content?.trim()) {
    return NextResponse.json({ error: "Nothing to check." }, { status: 400 });
  }

  try {
    const { data } = await supabase
      .from("writing_drafts")
      .select("content")
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(6);
    const published = (data || [])
      .map((d) => (d.content as string) || "")
      .filter((c) => c.trim().length > 120);

    if (published.length === 0) {
      return NextResponse.json({
        verdict: null,
        summary:
          "No published pieces yet to compare against. Publish a draft or two and Sam can check voice drift.",
        flags: [],
      });
    }

    const reference = published
      .map((s, i) => `--- Published piece ${i + 1} ---\n${s}`)
      .join("\n\n");

    const system = `You assess voice drift. You are given the author's established voice (their published pieces) and a new draft. Judge whether the draft sounds like the same person, and flag specific spots that drift — clichés, AI-tell phrasing, em-dash overuse, a register that's too formal/too hype, or anything off from the published voice. Be concrete and brief.`;
    const user = `Author's published voice:\n${reference}\n\n=== New draft to check ===\n${body.content.trim()}`;

    const resp = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1200,
      system,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: user }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = resp.content.find((b) => b.type === "text");
    const parsed = JSON.parse(text && "text" in text ? text.text : "{}");
    return NextResponse.json({
      verdict: parsed.verdict ?? null,
      summary: parsed.summary ?? "",
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    });
  } catch (err) {
    console.error("Sam voice-check error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Check failed" },
      { status: 500 },
    );
  }
}
