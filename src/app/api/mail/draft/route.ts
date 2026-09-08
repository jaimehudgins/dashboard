import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getThread } from "@/lib/gmail";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { generateEmailDraft } from "@/lib/email-draft";

interface DraftThread {
  id: string;
  messages: {
    from: string;
    subject: string;
    date: string;
    body: string;
    snippet: string;
  }[];
}

function providedThread(value: unknown, expectedId: string): DraftThread | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { id?: unknown; messages?: unknown };
  if (candidate.id !== expectedId || !Array.isArray(candidate.messages)) {
    return null;
  }
  const messages = candidate.messages
    .slice(-50)
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const item = message as Record<string, unknown>;
      return {
        from: typeof item.from === "string" ? item.from.slice(0, 1000) : "",
        subject:
          typeof item.subject === "string" ? item.subject.slice(0, 2000) : "",
        date: typeof item.date === "string" ? item.date.slice(0, 200) : "",
        body: typeof item.body === "string" ? item.body.slice(0, 20000) : "",
        snippet:
          typeof item.snippet === "string" ? item.snippet.slice(0, 2000) : "",
      };
    })
    .filter((message): message is NonNullable<typeof message> => Boolean(message));
  return messages.length > 0 ? { id: expectedId, messages } : null;
}

// POST /api/mail/draft
//   reply:   { threadId, notes? }    — drafts a reply to the thread
//   compose: { to?, subject?, notes } — drafts a brand-new email
// `notes` are the user's jotted intent/bullets that Leo expands in their own
// voice. The draft is returned for the user to edit before sending — nothing
// is sent here.
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
    threadId?: string;
    notes?: string;
    to?: string;
    subject?: string;
    thread?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const isReply = !!body.threadId;
  // Composing a new email needs at least a hint of what to say.
  if (!isReply && !body.notes?.trim() && !body.subject?.trim()) {
    return NextResponse.json(
      { error: "Add a subject or a few notes so Leo knows what to write." },
      { status: 400 },
    );
  }

  try {
    const openThread = isReply
      ? providedThread(body.thread, body.threadId!)
      : null;
    const thread = isReply ? openThread || await getThread(token, body.threadId!) : null;
    return NextResponse.json(await generateEmailDraft(token, name, thread, body));
  } catch (err) {
    console.error("Mail draft error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Draft failed" },
      { status: 500 },
    );
  }
}
