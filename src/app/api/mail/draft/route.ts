import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { getThread, getSentSamples } from "@/lib/gmail";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";

// POST /api/mail/draft  { threadId, notes? }
// Drafts a reply in the user's own voice. `notes` (optional) are the user's
// jotted intent/bullets that Leo expands into a full reply. The draft is
// returned for the user to edit before sending — nothing is sent here.
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

  let body: { threadId?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  try {
    const [thread, samples] = await Promise.all([
      getThread(token, body.threadId),
      getSentSamples(token, 5).catch(() => [] as string[]),
    ]);

    const convo = thread.messages
      .map(
        (m) =>
          `From: ${m.from}\nDate: ${m.date}\nSubject: ${m.subject}\n\n${m.body.slice(0, 4000)}`,
      )
      .join("\n\n--- next message ---\n\n");

    const voice = samples.length
      ? samples
          .map((s, i) => `--- Voice sample ${i + 1} ---\n${s}`)
          .join("\n\n")
      : "(No samples available. Use a warm, concise, professional tone.)";

    const system = `You are Leo, ${name}'s chief of staff. You draft email replies in ${name}'s own voice — matching the tone, warmth, sentence length, greeting and sign-off style of the writing samples below. Write as ${name} (first person), not about ${name}.

Rules:
- Output ONLY the reply body text, ready to paste into the reply box. No subject line, no "Here's a draft", no commentary, no markdown.
- Match the samples' register: how they open, how formal/casual they are, how they sign off. If samples are short and direct, be short and direct.
- Reply to the most recent message in the thread. Be substantive but concise.
- Never invent commitments, dates, numbers, or facts that aren't grounded in the thread or the user's notes. If something needs ${name}'s input, leave a brief [bracketed placeholder].

${name}'s writing voice samples:
${voice}`;

    const userPrompt = body.notes?.trim()
      ? `Email thread to reply to:\n\n${convo}\n\n---\n\n${name}'s notes for this reply (expand these into a full reply in their voice):\n${body.notes.trim()}`
      : `Email thread to reply to:\n\n${convo}\n\n---\n\nDraft ${name}'s reply to the most recent message.`;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: userPrompt }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const draft = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!draft) {
      return NextResponse.json(
        { error: "Leo couldn't produce a draft. Try again." },
        { status: 502 },
      );
    }
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("Mail draft error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Draft failed" },
      { status: 500 },
    );
  }
}
