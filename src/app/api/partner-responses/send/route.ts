import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getReplyContext, sendEmail } from "@/lib/gmail";
import { isOwnReply } from "@/lib/gmail-history";
import { getResponse, updateResponse } from "@/lib/partner-response-store";
import { isStaleDraft } from "@/types/partner-response";
import { replyRecipients, type ReplyMode } from "@/lib/reply-recipients";

const reviewSchema = z.object({
  threadId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
  version: z.number().int().positive(),
  mode: z.enum(["sender", "all"]).default("sender"),
});
const sendSchema = reviewSchema.extend({
  confirmed: z.literal(true),
  expectedMessageId: z.string().min(1).max(200),
  expectedTo: z.string().min(1).max(2000),
  expectedCc: z.string().max(10000).default(""),
  expectedSubject: z.string().max(2000),
}).strict();

class ReviewError extends Error {}

async function review(token: string, email: string, threadId: string, version: number, mode: ReplyMode) {
  const item = await getResponse(threadId);
  if (!item || item.version !== version) throw new ReviewError("This saved response changed. Reopen it from the queue before sending.");
  if (!item.draft.trim() || isStaleDraft(item)) throw new ReviewError("Save a draft based on the latest message before sending.");
  if (["waiting", "handled"].includes(item.status)) throw new ReviewError("This conversation is already waiting or handled. Check reply status before preparing another reply.");
  const context = await getReplyContext(token, threadId);
  if (!context.messageId || context.messageId !== item.message_id) throw new ReviewError("Newer email activity was found. Check mail, review the latest message, and update your draft before sending.");
  if (isOwnReply({ from: context.from, lastMessageSent: context.sent }, email)) throw new ReviewError("The latest message is already from you. Check reply status before sending another reply.");
  if (!context.to || !/@/.test(context.to) || /[\r\n]/.test(context.to + context.subject)) throw new ReviewError("The reply recipient or subject could not be verified. Open this thread in Mail.");
  let recipients;
  try { recipients = replyRecipients(context, mode, email); }
  catch { throw new ReviewError("Could not safely resolve Reply all recipients. Use Reply to sender or open the original conversation in Gmail."); }
  return { item, context, recipients };
}

function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid reply review request." }, { status: 400 });
  return NextResponse.json({ error: error instanceof ReviewError ? error.message : "Could not verify this reply. Your saved draft is unchanged; try reviewing again." }, { status: error instanceof ReviewError ? 409 : 503 });
}

// Read-only preview. No email is sent until the separate confirmed POST.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") return NextResponse.json({ error: "Reconnect Google to review and send." }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const input = reviewSchema.parse({ threadId: params.get("threadId"), version: Number(params.get("version")), mode: params.get("mode") ?? undefined });
    const { item, context, recipients } = await review(session.accessToken, session.user?.email ?? "", input.threadId, input.version, input.mode);
    return NextResponse.json({ ...recipients, mode: input.mode, subject: context.subject, messageId: context.messageId, draft: item.draft, version: item.version }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") return NextResponse.json({ error: "Reconnect Google before sending." }, { status: 401 });
  try {
    const input = sendSchema.parse(await request.json());
    const { item, context, recipients } = await review(session.accessToken, session.user?.email ?? "", input.threadId, input.version, input.mode);
    if (context.messageId !== input.expectedMessageId || recipients.to !== input.expectedTo || recipients.cc !== input.expectedCc || context.subject !== input.expectedSubject) throw new ReviewError("The reply details changed. Review the recipients and latest message again.");
    // Consume this reviewed version atomically. Repeated clicks/requests with the
    // same version cannot both send, even from separate app instances.
    let claimed;
    try { claimed = await updateResponse(item.thread_id, item.version, { draft: item.draft }); }
    catch { throw new ReviewError("This reply changed or a send is already in progress. Check Mail before retrying."); }
    // Recheck after claiming, immediately before the Gmail write. Google does
    // not offer an atomic 'send only if thread unchanged' operation.
    const latest = await getReplyContext(session.accessToken, item.thread_id);
    const latestRecipients = replyRecipients(latest, input.mode, session.user?.email ?? "");
    if (latest.messageId !== context.messageId || latestRecipients.to !== recipients.to || latestRecipients.cc !== recipients.cc || latest.subject !== context.subject) throw new ReviewError("Newer email activity was found. Nothing was sent by this request. Reopen the conversation and review it again.");
    let sent;
    try {
      sent = await sendEmail(session.accessToken, { to: recipients.to, cc: recipients.cc || undefined, subject: context.subject, body: item.draft.trim(), inReplyTo: context.inReplyTo, references: context.references }, item.thread_id);
      if (!sent.id) throw new Error("Missing send receipt");
    } catch {
      // A lost response can mean Gmail accepted the message. Never auto-retry.
      return NextResponse.json({ error: "Gmail did not confirm whether the reply was sent. Check this thread in Mail or Gmail before trying again. Your saved draft is retained.", uncertain: true }, { status: 502 });
    }
    let updated = null;
    let warning = null;
    // Clearing the confirmed-sent text archives it through the existing DB
    // revision trigger. Failed/uncertain sends retain the active draft.
    try { updated = await updateResponse(item.thread_id, claimed.version, { status: "waiting", draft: "", draft_message_id: null, draft_sources: [] }); }
    catch { warning = "Reply sent. The queue could not be updated immediately; Check mail will reconcile it. Do not send again."; }
    return NextResponse.json({ ok: true, messageId: sent.id, item: updated, warning });
  } catch (error) { return failure(error); }
}
