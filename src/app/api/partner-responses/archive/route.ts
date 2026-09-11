import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { archiveThread } from "@/lib/gmail";
import { gmailProfile, threadMetadata } from "@/lib/gmail-history";
import { getResponse, updateResponse } from "@/lib/partner-response-store";
import { archiveWarnings } from "@/lib/partner-archive";

const schema = z.object({
  threadId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
  version: z.number().int().positive(),
  expectedMessageId: z.string().min(1).max(200),
  confirmed: z.literal(true),
  acknowledgeFollowUp: z.boolean().optional(),
}).strict();

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = (process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org").toLowerCase();
  if (session?.user?.email?.toLowerCase() !== email || !session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Reconnect Google before archiving." }, { status: 401 });
  }
  try {
    const input = schema.parse(await request.json());
    const item = await getResponse(input.threadId);
    if (!item) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    if (item.version !== input.version || item.message_id !== input.expectedMessageId) return NextResponse.json({ error: "This conversation changed. Refresh and review it before archiving." }, { status: 409 });
    const warnings = archiveWarnings(item);
    if (warnings.length && !input.acknowledgeFollowUp) return NextResponse.json({ error: "Review outstanding follow-ups before archiving this conversation.", warnings }, { status: 409 });
    const profile = await gmailProfile(session.accessToken);
    if (profile.emailAddress.toLowerCase() !== email) return NextResponse.json({ error: "The connected Gmail account does not match Leo's account." }, { status: 403 });
    // Consume the reviewed version: stale tabs and duplicate clicks cannot
    // repeat this action. Keep it active until Gmail and the latest message
    // are verified; an uncertain write must not hide outstanding work.
    const claimed = await updateResponse(item.thread_id, item.version, { in_inbox: item.in_inbox });
    const latest = await threadMetadata(session.accessToken, item.thread_id);
    if (!latest || latest.lastMessageId !== input.expectedMessageId) return NextResponse.json({ error: "New email activity was found. Check reply status and review it before archiving." }, { status: 409 });
    if (latest.labelIds.includes("INBOX")) {
      try { await archiveThread(session.accessToken, item.thread_id); }
      catch {
        // Gmail may have applied the write despite a lost response. Never
        // automatically retry; let the user reconcile current Gmail state.
        return NextResponse.json({ error: "Gmail did not confirm whether archiving finished. Check Gmail or Check reply status before trying again. Saved work is unchanged.", uncertain: true }, { status: 502 });
      }
    }
    try {
      // Read back labels so an arrival during archiving is not reported as a
      // quiet, completed conversation. Gmail thread modification isn't atomic
      // with the latest-message check; warn on that race rather than hiding it.
      const after = await threadMetadata(session.accessToken, item.thread_id);
      if (!after || after.lastMessageId !== latest.lastMessageId) throw new Error("New activity");
      const inInbox = after.labelIds.includes("INBOX");
      // Reuse the existing handled lifecycle: label-only syncs keep it hidden,
      // a new incoming message reopens it, and saved work remains intact.
      // This is NOT a no_reply correction or a completed Work task.
      const updated = await updateResponse(item.thread_id, claimed.version, { in_inbox: inInbox, ...(!inInbox ? { status: "handled" as const } : {}) });
      return NextResponse.json({ ok: true, item: updated, notice: updated.in_inbox
        ? "Gmail still shows this conversation in the inbox. It remains active in Attention; check its latest activity before trying again."
        : "Archived—not deleted. Moved to Handled recently and removed from Gmail’s inbox and active Attention. Notes, drafts, and Work tasks are retained. A new partner email brings it back after the next mail check." });
    } catch {
      return NextResponse.json({ ok: true, item: null, notice: "Gmail confirmed the archive, but newer activity or a queue update needs review. It has not been removed from active Attention. Refresh and review before archiving again." });
    }
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid archive request. Confirmation is required." }, { status: 400 });
    return NextResponse.json({ error: "Could not verify the conversation for archiving. Refresh the queue before trying again." }, { status: 409 });
  }
}
