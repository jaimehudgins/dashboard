import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { getSentSamples } from "@/lib/gmail";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string", description: "Email subject line." },
    body: { type: "string", description: "The email body, ready to send." },
  },
  required: ["subject", "body"],
};

// POST /api/granola/draft-followup  { meetingId, notes? }
// Drafts a post-meeting follow-up email in the user's voice from the Granola
// notes. Returns recipients + subject + body for the user to edit before send.
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

  let body: { meetingId?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.meetingId) {
    return NextResponse.json({ error: "meetingId required" }, { status: 400 });
  }

  try {
    const { data: m } = await supabase
      .from("granola_meetings")
      .select("title, summary, attendees, owner_email")
      .eq("id", body.meetingId)
      .maybeSingle();
    if (!m) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const attendees = (m.attendees as { name: string; email?: string }[]) || [];
    const ownerEmail = (m.owner_email as string)?.toLowerCase() || "";
    const recipients = attendees.filter(
      (a) => a.email && a.email.toLowerCase() !== ownerEmail,
    );
    const to = recipients.map((a) => a.email).join(", ");
    const recipientNames =
      recipients.map((a) => a.name).filter(Boolean).join(", ") || "the attendees";

    const samples = await getSentSamples(token, 5).catch(() => [] as string[]);
    const voice = samples.length
      ? samples.map((s, i) => `--- Voice sample ${i + 1} ---\n${s}`).join("\n\n")
      : "(No samples available. Use a warm, concise, professional tone.)";

    const system = `You are Leo, ${name}'s chief of staff. You draft a post-meeting follow-up email in ${name}'s own voice — matching the tone, warmth, sentence length, greeting and sign-off of the writing samples below. Write as ${name} (first person), to the other meeting attendees.

Structure the email:
1. A warm one-line opener + thanks for their time.
2. A SUMMARY-LEVEL recap — 2–3 sentences capturing the gist and any key decisions or alignment. Do NOT narrate the meeting blow-by-blow or list "this happened, then this happened." Zoom out.
3. The next steps / who-owns-what, clearly (this is the part that matters most).
4. A natural sign-off in ${name}'s style.

Accuracy:
- Do NOT guess the spelling of proper nouns (people, schools, organizations). If you're unsure of a name's spelling, address people by first name and avoid naming the organization rather than risk getting it wrong.
- No invented commitments, dates, or facts beyond the notes. If something needs ${name}'s input, leave a brief [bracketed placeholder].

Match the samples' register exactly. Keep it concise and skimmable. Plain text, no markdown — ready to send.

${name}'s writing voice samples:
${voice}`;

    const userPrompt = `Meeting: ${m.title}
Recipients: ${recipientNames}

Meeting notes (summary + next steps):
${(m.summary as string) || "(no summary)"}${
      body.notes?.trim()
        ? `\n\n${name}'s notes to weave in:\n${body.notes.trim()}`
        : ""
    }`;

    const resp = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: userPrompt }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const text = resp.content.find((b) => b.type === "text");
    const parsed = JSON.parse(text && "text" in text ? text.text : "{}");
    return NextResponse.json({
      to,
      subject:
        typeof parsed.subject === "string" && parsed.subject
          ? parsed.subject
          : `Following up: ${m.title}`,
      body: typeof parsed.body === "string" ? parsed.body : "",
    });
  } catch (err) {
    console.error("Granola follow-up draft error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Draft failed" },
      { status: 500 },
    );
  }
}
