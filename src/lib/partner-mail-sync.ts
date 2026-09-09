import "server-only";
import { randomUUID } from "node:crypto";
import { crmSupabase, isCrmConfigured } from "./crm-supabase";
import { GmailApiError, type ClassifyThread } from "./gmail";
import { changedThreadIds, gmailHistory, gmailProfile, initialThreadIds, isOwnReply, recoveryThreadIds, threadMetadata } from "./gmail-history";
import { classifyInbox } from "./mail-classify";
import { getMailSyncState, getResponse, responseDb, storeError, updateResponse } from "./partner-response-store";
import { responseAfterMessage } from "@/types/partner-response";

const PUBLIC_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "aol.com", "live.com"]);
const domain = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";
const isInternal = (email: string) => domain(email) === "willowed.org" || domain(email).endsWith(".willowed.org");

async function partnerDirectory() {
  const partners: { id: string; name: string }[] = [];
  const contacts: { email: string | null; partner_id: string }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await crmSupabase.from("partners").select("id, name").order("id").range(offset, offset + 499);
    if (error) throw new Error("Could not read TEMU partners; mail sync will retry.");
    partners.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await crmSupabase.from("contacts").select("email, partner_id").order("id").range(offset, offset + 499);
    if (error) throw new Error("Could not read TEMU contacts; mail sync will retry.");
    contacts.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
  }
  return { partners, contacts };
}

export function matchResponsePartner(
  participants: string[],
  contacts: { email: string | null; partner_id: string }[],
  partners: { id: string; name: string }[],
) {
  const external = participants.map((email) => email.toLowerCase()).filter((email) => !isInternal(email));
  const exact = contacts.filter((contact) => contact.email && external.includes(contact.email.toLowerCase()));
  const candidates = exact.length ? exact : contacts.filter((contact) => contact.email && external.some((email) =>
    domain(email) === domain(contact.email!) && !PUBLIC_DOMAINS.has(domain(email)),
  ));
  const ids = [...new Set(candidates.map((contact) => contact.partner_id))];
  return ids.length === 1 ? partners.find((partner) => partner.id === ids[0]) ?? null : null;
}

export async function syncPartnerMail(token: string) {
  const db = responseDb();
  const lockId = randomUUID();
  const { data: claimed, error: claimError } = await db.rpc("claim_partner_mail_sync", { claim_id: lockId });
  if (claimError) storeError(claimError);
  if (!claimed) return { busy: true, changed: 0, complete: false, urgentPartnerThreads: [] };

  try {
    const state = await getMailSyncState();
    const profile = await gmailProfile(token);
    if (profile.emailAddress.toLowerCase() !== (process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org").toLowerCase()) {
      throw new Error("The connected Gmail account does not match Leo's account.");
    }
    if (!isCrmConfigured) throw new Error("Connect TEMU before syncing partner responses.");
    const { partners, contacts } = await partnerDirectory();

    let ids: string[];
    let nextHistoryId = profile.historyId;
    let nextPageToken: string | null = null;
    let mode = state.history_id ? "incremental" : "initial";
    let pendingIds: string[] | null = state.pending_thread_ids;
    let baseline = state.pending_history_id ?? profile.historyId;
    if (pendingIds) {
      ids = pendingIds;
      mode = state.pending_mode ?? "recovery";
    } else if (state.history_id) {
      try {
        const page = await gmailHistory(token, state.history_id, state.page_token);
        ids = changedThreadIds(page);
        nextPageToken = page.nextPageToken ?? null;
        // A paginated change set retains its starting cursor until the final page.
        nextHistoryId = nextPageToken ? state.history_id : page.historyId;
      } catch (error) {
        if (!(error instanceof GmailApiError) || error.status !== 404) throw error;
        mode = "recovery";
        ids = await recoveryThreadIds(token);
      }
    } else {
      ids = await initialThreadIds(token);
    }
    if (mode === "recovery" && !pendingIds) {
      // Refresh every tracked item too: archived/sent/deleted changes may have
      // happened while the history cursor was expired. Never erase local drafts.
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await db.from("partner_responses").select("thread_id").order("thread_id").range(offset, offset + 499);
        if (error) storeError(error);
        ids.push(...(data ?? []).map((row) => row.thread_id as string));
        if ((data?.length ?? 0) < 500) break;
      }
      ids = [...new Set(ids)];
    }
    if (mode !== "incremental") {
      if (!pendingIds) {
        baseline = profile.historyId;
        const { error } = await db.from("partner_mail_sync").update({ pending_thread_ids: ids, pending_history_id: baseline, pending_mode: mode }).eq("id", "primary").eq("lock_id", lockId);
        if (error) storeError(error);
      }
      // Initial and recovery scans resume in bounded chunks instead of
      // restarting a large scan forever after a timeout.
      pendingIds = ids.slice(50);
      ids = ids.slice(0, 50);
      nextHistoryId = pendingIds.length ? state.history_id ?? "" : baseline;
    }

    const started = Date.now();
    const threads: ClassifyThread[] = [];
    const removed: string[] = [];
    // Bound bursts even when a history page references many threads.
    for (let i = 0; i < ids.length; i += 3) {
      if (Date.now() - started > 180_000) throw new Error("Mail sync paused before its time limit. The same changes will be retried.");
      const rows = await Promise.all(ids.slice(i, i + 3).map(async (id) => ({ id, thread: await threadMetadata(token, id) })));
      for (const row of rows) {
        if (row.thread?.lastMessageId && !row.thread.labelIds.includes("TRASH") && !row.thread.labelIds.includes("SPAM")) threads.push(row.thread);
        else removed.push(row.id);
      }
    }
    const classified = await classifyInbox(token, threads.filter((thread) => thread.labelIds.includes("INBOX") && !isOwnReply(thread, profile.emailAddress)));
    for (const thread of threads) {
      const previous = await getResponse(thread.id);
      const partner = matchResponsePartner(thread.participants, contacts ?? [], partners ?? []);
      const bucket = classified.buckets[thread.id];
      if (!previous && (!thread.labelIds.includes("INBOX") || (!partner && bucket !== "current" && bucket !== "potential"))) continue;
      const incoming = !isOwnReply(thread, profile.emailAddress);
      const decision = classified.decisions[thread.id];
      const sameMessage = previous?.message_id === thread.lastMessageId;
      const patch = {
        partner_id: partner?.id ?? null,
        partner_name: partner?.name ?? "Partner to confirm",
        subject: thread.subject, sender: thread.from, snippet: thread.snippet,
        message_id: thread.lastMessageId, received_at: thread.date || null,
        in_inbox: thread.labelIds.includes("INBOX"),
        urgency: decision?.urgency ?? (sameMessage ? previous?.urgency : null) ?? "question",
        confidence: decision?.confidence ?? (sameMessage ? previous?.confidence : null) ?? "low",
        reason: !incoming && previous?.status === "handled" ? "No follow-up needed unless a new incoming email arrives." : !incoming && (!sameMessage || previous?.status === "waiting") ? "Your reply is the latest message. Waiting for the partner; saved drafts are retained." : decision?.reason ?? (sameMessage ? previous?.reason : null) ?? "Review this partner conversation to decide whether a response is needed.",
        status: responseAfterMessage(previous, thread.lastMessageId, incoming, Boolean(partner)),
      };
      if (previous) {
        const unchanged = Object.entries(patch).every(([key, value]) => previous[key as keyof typeof previous] === value);
        if (unchanged) continue;
        // A concurrent human edit causes the page to retry, not overwrite it.
        await updateResponse(thread.id, previous.version, patch);
      } else {
        const { error } = await db.from("partner_responses").insert({ thread_id: thread.id, ...patch });
        if (error) storeError(error);
      }
    }
    for (const id of removed) {
      const previous = await getResponse(id);
      if (previous) await updateResponse(id, previous.version, { status: "handled", in_inbox: false, reason: "This thread was removed from Gmail or moved to trash/spam. Saved work is retained." });
    }
    const { error: finishError } = await db.from("partner_mail_sync").update({
      history_id: nextHistoryId || null, page_token: nextPageToken,
      pending_thread_ids: pendingIds?.length ? pendingIds : null,
      pending_history_id: pendingIds?.length ? baseline : null,
      pending_mode: pendingIds?.length ? mode : null,
      ...(nextPageToken || pendingIds?.length ? {} : { last_checked_at: new Date().toISOString() }),
      last_error: null, last_mode: mode, changed_count: ids.length,
    }).eq("id", "primary").eq("lock_id", lockId);
    if (finishError) storeError(finishError);
    return { busy: false, changed: ids.length, complete: !nextPageToken && !pendingIds?.length, urgentPartnerThreads: classified.urgentPartnerThreads };
  } catch (error) {
    await db.from("partner_mail_sync").update({ last_error: error instanceof Error ? error.message.slice(0, 400) : "Mail sync failed; saved responses are retained." }).eq("id", "primary").eq("lock_id", lockId);
    throw error;
  } finally {
    await db.from("partner_mail_sync").update({ lock_id: null, lock_until: null }).eq("id", "primary").eq("lock_id", lockId);
  }
}
