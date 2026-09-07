import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { runLeoAgent } from "@/lib/leo-agent";
import type { LeoAgentMessage } from "@/lib/leo-agent";

type ChatMessage = LeoAgentMessage;

// POST /api/chat  { messages: ChatMessage[] }
// Runs Leo as a tool-using agent over his own MCP tool surface and returns the
// final reply (plus the names of any tools used, for display).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const allowed = process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org";
  if (!session?.user?.email || session.user.email !== allowed) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  if (!isAnthropicConfigured) {
    return NextResponse.json(
      { error: "Chat isn't configured (no Anthropic API key)." },
      { status: 503 },
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = (body.messages || []).filter((m) => m.content?.trim());
  if (input.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  // Resolve our own origin robustly behind Vercel's proxy.
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const base = host ? `${proto}://${host}` : new URL(req.url).origin;
  const token = process.env.MCP_TOKEN?.trim();

  const name = session.user.name || "Jaime";

  try {
    const result = await runLeoAgent({
      base,
      token,
      name,
      messages: input,
      surface: "web",
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Chat error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Leo ran into a problem: ${detail}` },
      { status: 500 },
    );
  }
}
