import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

// POST /api/writers-room  { personaId, content }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAnthropicConfigured) {
    return NextResponse.json(
      { error: "The Writers' Room needs ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  let body: { personaId?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.personaId || !body.content?.trim()) {
    return NextResponse.json(
      { error: "personaId and content required" },
      { status: 400 },
    );
  }

  try {
    const { data: p } = await supabase
      .from("personas")
      .select("*")
      .eq("id", body.personaId)
      .maybeSingle();
    if (!p) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    const system = `You are "${p.name}". ${p.description || ""} ${p.role_context || ""}
Your voice: ${p.voice || ""}

You're in a writers' room giving a gut reaction to a draft (a piece of writing, a lesson, a plan). React IN CHARACTER as this person — honest, specific, and useful. Point to actual lines or moments. Say what lands, what doesn't, and what you'd push on. Be candid, not cruel, and never a sycophant. Keep it to a few short paragraphs or punchy bullets. Do not rewrite it for them; react to it.`;

    const resp = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: body.content.trim() }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const reaction = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return NextResponse.json({ reaction });
  } catch (err) {
    console.error("Writers room error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
