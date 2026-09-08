import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { generateEmailDraft } from "@/lib/email-draft";
import { getThread } from "@/lib/gmail";
import { threadMetadata } from "@/lib/gmail-history";
import { getMailSyncState, getResponse, responseDb, responseStoreConfigured, storeError, updateResponse } from "@/lib/partner-response-store";
import { syncPartnerMail } from "@/lib/partner-mail-sync";

export const maxDuration = 300;
const statuses = ["needs_response", "draft_ready", "needs_input", "waiting", "handled"] as const;
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
const patchSchema = z.object({
  threadId: idSchema,
  version: z.number().int().positive(),
  status: z.enum(statuses).optional(),
  notes: z.string().max(10000).optional(),
  follow_up_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }).nullable().optional(),
  draft: z.string().max(30000).optional(),
}).strict();

async function authorized() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === (process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org").toLowerCase() ? session : null;
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Partner responses are unavailable. Saved work is retained.";
  const status = error instanceof z.ZodError || error instanceof SyntaxError ? 400 : /changed|new message/i.test(message) ? 409 : /need.*migration|need.*SUPABASE_SERVICE_ROLE_KEY/i.test(message) ? 503 : 500;
  return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid response details." : message }, { status });
}

export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!responseStoreConfigured) return NextResponse.json({ configured: false, items: [], setup: "Partner responses need SUPABASE_SERVICE_ROLE_KEY and partner-response-queue.sql in Leo." });
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("summary") === "1") {
      const { data: rows, error } = await responseDb().from("partner_responses")
        .select("thread_id, sender, subject, snippet, received_at, urgency, status")
        .in("status", ["needs_response", "needs_input", "draft_ready"])
        .order("received_at", { ascending: false }).limit(100);
      if (error) storeError(error);
      return NextResponse.json({ configured: true, threads: (rows ?? []).map((item) => ({
        id: item.thread_id, from: item.sender, subject: item.subject, snippet: item.snippet,
        date: item.received_at, unread: true, urgency: item.urgency,
      })) });
    }
    if (params.has("threadId")) {
      const id = idSchema.parse(params.get("threadId"));
      const item = await getResponse(id);
      const { data: revisions, error } = await responseDb().from("partner_response_revisions").select("id, draft, message_id, sources, saved_at").eq("thread_id", id).order("saved_at", { ascending: false }).limit(10);
      if (error) storeError(error);
      return NextResponse.json({ configured: true, item, revisions });
    }
    const lane = params.get("lane") ?? "all";
    if (!["all", "critical", ...statuses].includes(lane)) throw new z.ZodError([]);
    const page = z.coerce.number().int().min(0).max(10000).parse(params.get("page") ?? "0");
    let query = responseDb().from("partner_responses").select("*", { count: "exact" });
    if (lane === "all") query = query.neq("status", "handled");
    else if (lane === "critical") query = query.eq("urgency", "now").in("status", ["needs_response", "needs_input", "draft_ready"]);
    else query = query.eq("status", lane);
    const [{ data: items, error, count }, sync, counts] = await Promise.all([
      query.order("received_at", { ascending: false, nullsFirst: false }).order("thread_id").range(page * 50, page * 50 + 49),
      getMailSyncState(),
      Promise.all(statuses.map(async (status) => {
        const result = await responseDb().from("partner_responses").select("thread_id", { count: "exact", head: true }).eq("status", status);
        if (result.error) storeError(result.error);
        return [status, result.count ?? 0];
      })),
    ]);
    if (error) storeError(error);
    return NextResponse.json({ configured: true, items, sync, counts: Object.fromEntries(counts), hasMore: (page + 1) * 50 < (count ?? 0) });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { threadId, version, draft, ...patch } = patchSchema.parse(await request.json());
    const item = await getResponse(threadId);
    if (!item) return NextResponse.json({ error: "Response not found" }, { status: 404 });
    if (patch.status === "draft_ready" && (draft !== undefined ? !draft.trim() : !item.draft.trim() || item.draft_message_id !== item.message_id)) {
      return NextResponse.json({ error: "Save a current draft before marking it ready." }, { status: 400 });
    }
    const updated = await updateResponse(threadId, version, {
      ...patch,
      ...(draft === undefined ? {} : {
        draft, draft_message_id: item.message_id,
        status: patch.status ?? (draft.trim() ? "draft_ready" as const : "needs_response" as const),
      }),
    });
    return NextResponse.json({ item: updated });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const session = await authorized();
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") return NextResponse.json({ error: "Reconnect Google to check mail or prepare a draft." }, { status: 401 });
  try {
    const body = z.discriminatedUnion("action", [
      z.object({ action: z.literal("sync") }).strict(),
      z.object({ action: z.literal("draft"), threadId: idSchema, version: z.number().int().positive(), notes: z.string().max(10000).optional() }).strict(),
    ]).parse(await request.json());
    if (body.action === "sync") return NextResponse.json(await syncPartnerMail(session.accessToken));
    const item = await getResponse(body.threadId);
    if (!item) return NextResponse.json({ error: "Response not found" }, { status: 404 });
    if (item.version !== body.version) throw new Error("This response changed. Reload it before preparing another draft.");
    const metadata = await threadMetadata(session.accessToken, item.thread_id);
    if (!metadata || metadata.lastMessageId !== item.message_id) throw new Error("A new message or thread change needs to be synced. Check mail, then draft again.");
    const thread = await getThread(session.accessToken, item.thread_id);
    const result = await generateEmailDraft(session.accessToken, session.user?.name ?? "Jaime", {
      ...thread, messages: thread.messages.map((message) => ({ ...message, body: message.cleanBody || message.body })),
    }, { notes: body.notes ?? item.notes });
    const after = await threadMetadata(session.accessToken, item.thread_id);
    if (!after || after.lastMessageId !== item.message_id) throw new Error("A new message arrived while Leo was drafting. Check mail and prepare a fresh reply.");
    const updated = await updateResponse(item.thread_id, item.version, {
      draft: result.draft, draft_sources: result.sources, draft_message_id: item.message_id,
      status: /\[[^\]]+\]/.test(result.draft) ? "needs_input" : "draft_ready",
    });
    return NextResponse.json({ item: updated });
  } catch (error) { return failure(error); }
}
