import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail, getReplyContext, archiveThread } from "@/lib/gmail";
import { threadMetadata } from "@/lib/gmail-history";
import { getResponse, responseStoreConfigured, updateResponse } from "@/lib/partner-response-store";

// POST /api/mail/actions  { action: "reply"|"send"|"archive", ... }
// These are user-initiated from the inbox UI (the click IS the confirmation).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const token = session.accessToken;

  let body: {
    action?: string;
    threadId?: string;
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
    expectedMessageId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "archive") {
      if (!body.threadId)
        return NextResponse.json({ error: "threadId required" }, { status: 400 });
      await archiveThread(token, body.threadId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "reply") {
      if (!body.threadId || !body.body)
        return NextResponse.json(
          { error: "threadId and body required" },
          { status: 400 },
        );
      const ctx = await getReplyContext(token, body.threadId);
      if (body.expectedMessageId) {
        const latest = await threadMetadata(token, body.threadId);
        if (!latest || latest.lastMessageId !== body.expectedMessageId) return NextResponse.json({ error: "This thread changed. Check mail in Attention and review the latest message before sending." }, { status: 409 });
      }
      const sent = await sendEmail(
        token,
        {
          to: ctx.to,
          subject: ctx.subject,
          body: body.body,
          inReplyTo: ctx.inReplyTo,
          references: ctx.references,
        },
        body.threadId,
      );
      // A bookkeeping failure must not report a successful email as failed:
      // retrying Send would deliver the same reply twice. Gmail history will
      // reconcile the outgoing reply on the next sync.
      let queueWarning: string | null = null;
      if (responseStoreConfigured) {
        try {
          const item = await getResponse(body.threadId);
          if (item && (item.message_id === body.expectedMessageId || item.message_id === sent.id)) {
            await updateResponse(item.thread_id, item.version, { status: "needs_input", reason: "Reply sent. Assess whether a specific question still needs a partner answer." });
          } else if (item) {
            queueWarning = "Reply sent. Check the queue for newer activity after the next mail check.";
          }
        } catch { queueWarning = "Reply sent. The queue will catch up on the next mail check."; }
      }
      return NextResponse.json({ ok: true, messageId: sent.id, queueWarning });
    }

    if (body.action === "send") {
      if (!body.to || !body.subject || !body.body)
        return NextResponse.json(
          { error: "to, subject and body required" },
          { status: 400 },
        );
      const sent = await sendEmail(token, {
        to: body.to,
        cc: body.cc,
        subject: body.subject,
        body: body.body,
      });
      return NextResponse.json({ ok: true, messageId: sent.id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Mail action error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 },
    );
  }
}
