import assert from "node:assert/strict";
import { z } from "zod";
import { memoryDb, moduleLoader } from "./offline-runtime.mjs";

export async function evaluateLifecycle(snapshot = null) {
  const moduleAt = moduleLoader(snapshot);
  const env = { LEO_ALLOWED_EMAIL: "owner@willowed.org", SUPABASE_SERVICE_ROLE_KEY: "synthetic-only", NEXT_PUBLIC_SUPABASE_URL: "https://not-a-real-db.example" };
  const tables = { partner_responses: [], partner_mail_sync: [{ id: "primary", history_id: "100", page_token: null, pending_thread_ids: null, lock_id: null }], leo_notifications: [] };
  const db = memoryDb(tables);
  const store = moduleAt("src/lib/partner-response-store.ts", { "@supabase/supabase-js": { createClient: () => db }, "./supabase": { supabase: db } }, env);
  const states = moduleAt("src/types/partner-response.ts");
  class GmailApiError extends Error {}
  const messages = [];
  const history = moduleAt("src/lib/gmail-history.ts", { "./gmail": { GmailApiError, getThread: async () => ({ messages: messages.map((message) => ({ id: message.id, sent: message.labelIds.includes("SENT"), body: "Different sent text", cleanBody: "Different sent text" })) }) } });
  let event = 100;
  let urgency = "question";
  let metadataFails = false;
  let arriveDuringDraft = false;
  const events = [];
  function arrive(id, own = false) {
    messages.push({ id, internalDate: String(1788870000000 + (++event * 1000)), labelIds: [own ? "SENT" : "INBOX"], snippet: "Synthetic request", payload: { headers: [
      { name: "From", value: own ? "Owner <alias@other.example>" : "Maya <maya@cedar.example>" },
      { name: "To", value: own ? "maya@cedar.example" : "owner@willowed.org" },
      { name: "Subject", value: "Cedar implementation" },
    ] } });
  }
  const fakeHistory = { ...history,
    gmailProfile: async () => ({ emailAddress: env.LEO_ALLOWED_EMAIL, historyId: String(event) }),
    gmailHistory: async () => ({ historyId: String(event), history: [{ messages: [{ id: messages.at(-1).id, threadId: "thread" }] }] }),
    threadMetadata: async () => {
      if (metadataFails) throw new Error("Synthetic Gmail temporarily unavailable");
      return history.classifyMetadata({ id: "thread", messages });
    },
  };
  const crm = memoryDb({ partners: [{ id: "cedar", name: "Cedar Ridge" }], contacts: [{ id: "maya", email: "maya@cedar.example", partner_id: "cedar" }] });
  const sync = moduleAt("src/lib/partner-mail-sync.ts", {
    "node:crypto": { randomUUID: () => "test-lease" }, "./crm-supabase": { isCrmConfigured: true, crmSupabase: crm },
    "./gmail": { GmailApiError }, "./gmail-history": fakeHistory,
    "./mail-classify": { classifyInbox: async (_token, threads) => ({ buckets: {}, decisions: Object.fromEntries(threads.map((t) => [t.id, { urgency, confidence: "high", reason: "Synthetic classifier verdict" }])) }) },
    "./partner-response-store": store, "@/types/partner-response": states,
  }, env);
  const policy = moduleAt("src/lib/response-needed-policy.ts");
  const replyStatus = moduleAt("src/lib/partner-reply-status.ts", { "./gmail-history": fakeHistory, "./partner-response-store": store });
  const api = moduleAt("src/app/api/partner-responses/route.ts", {
    "@/lib/partner-response-lane-store": { getInputLaneIndex: async () => { throw new Error("Lifecycle does not exercise list reads; see scripts/check-response-lanes.mjs"); } },
    "next-auth": { getServerSession: async () => ({ user: { email: env.LEO_ALLOWED_EMAIL }, accessToken: "synthetic" }) },
    "next/server": { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } }, zod: { z }, "@/lib/auth": {},
    "@/lib/email-draft": { generateEmailDraft: async () => { if (arriveDuringDraft) arrive("mid-draft"); return { draft: "Synthetic prepared draft", sources: [] }; } },
    "@/lib/gmail": { getThread: async () => ({ id: "thread", messages: [] }) },
    "@/lib/gmail-history": fakeHistory, "@/lib/partner-mail-sync": sync,
    "@/lib/partner-reply-status": replyStatus,
    "@/lib/partner-response-policy": { responsePolicyStatus: async () => ({ ready: true }) },
    "@/lib/response-needed-policy": policy, "@/lib/partner-response-store": store,
  }, env);
  const item = () => store.getResponse("thread");
  const request = (method, body) => new Request("https://leo.example/api/partner-responses", { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  async function patch(fields, version) {
    return api.PATCH(request("PATCH", { threadId: "thread", version: version ?? (await item()).version, ...fields }));
  }
  async function checkpoint(title, status) {
    const row = await item();
    assert.equal(row.status, status, title);
    assert.equal(tables.partner_responses.length, 1, "one saved response per thread");
    events.push({ title, status: row.status, message: row.message_id, version: row.version });
  }
  arrive("incoming-1");
  await sync.syncPartnerMail("synthetic");
  await checkpoint("Incoming partner request enters queue", "needs_response");
  assert.equal((await store.pendingPartnerAlerts()).length, 0, "ordinary question is not an immediate alert");
  assert.equal((await patch({ draft: "Jaime's edited draft", status: "draft_ready", notes: "Preserve my notes" })).status, 200);
  await checkpoint("Human-edited draft is saved", "draft_ready");
  arrive("sent-2", true);
  await sync.syncPartnerMail("synthetic");
  await checkpoint("Reply sent from an alias moves to waiting", "waiting");
  assert.equal((await item()).draft, "Jaime's edited draft");
  const oldVersion = (await item()).version;
  assert.equal((await patch({ status: "handled", follow_up_on: "2026-09-10" })).status, 200);
  assert.equal((await item()).follow_up_on, null);
  await checkpoint("Human closes follow-up without losing notes", "handled");
  assert.equal((await item()).notes, "Preserve my notes");
  messages[0].labelIds.push("UNREAD");
  await sync.syncPartnerMail("synthetic");
  await checkpoint("Label-only replay does not reopen work", "handled");
  arrive("sent-3", true);
  await sync.syncPartnerMail("synthetic");
  await checkpoint("Another own reply does not reopen handled work", "handled");
  urgency = "now";
  arrive("incoming-4");
  await sync.syncPartnerMail("synthetic");
  await checkpoint("New urgent partner message reopens work", "needs_response");
  assert.equal(states.isStaleDraft(await item()), true);
  assert.equal((await store.pendingPartnerAlerts()).length, 1);
  // Simulate successful Slack delivery persistence, not an actual Slack send.
  tables.leo_notifications.push({ notification_key: "urgent:gmail:thread:incoming-4", status: "sent" });
  await sync.syncPartnerMail("synthetic");
  assert.equal((await store.pendingPartnerAlerts()).length, 0, "replay cannot alert twice for the same message");
  assert.equal((await patch({ notes: "Stale browser edit" }, oldVersion)).status, 409);
  assert.equal((await item()).notes, "Preserve my notes");
  events.push({ title: "Duplicate alert and stale browser write rejected", passed: true });
  const cursor = tables.partner_mail_sync[0].history_id;
  metadataFails = true;
  arrive("incoming-5");
  await assert.rejects(() => sync.syncPartnerMail("synthetic"), /temporarily unavailable/);
  assert.equal(tables.partner_mail_sync[0].history_id, cursor);
  assert.equal(tables.partner_mail_sync[0].lock_id, null);
  metadataFails = false;
  await sync.syncPartnerMail("synthetic");
  assert.equal((await store.pendingPartnerAlerts()).length, 1, "a genuinely new urgent email is eligible again");
  events.push({ title: "Failed sync retains cursor; retry finds new urgent email", passed: true });
  arriveDuringDraft = true;
  const draftResult = await api.POST(request("POST", { action: "draft", threadId: "thread", version: (await item()).version }));
  assert.equal(draftResult.status, 409, "new mail during generation rejects stale draft");
  assert.equal((await item()).draft, "Jaime's edited draft");
  events.push({ title: "Mid-generation incoming mail cannot overwrite saved draft", passed: true });
  return { passed: true, events, limitations: "Classifier and model outputs, Gmail, DB, and Slack delivery are synthetic. This tests native sync/store/API transitions and alert eligibility, not actual send delivery or urgency-model accuracy." };
}
