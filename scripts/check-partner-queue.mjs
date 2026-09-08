// Focused offline regression checks. No secrets, network, Gmail writes, or DB writes.
// Run: node scripts/check-partner-queue.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";

function moduleAt(path, mocks = {}, suffix = "") {
  const compiled = ts.transpileModule(fs.readFileSync(path, "utf8") + suffix, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require: (id) => {
      if (id === "server-only") return {};
      if (id in mocks) return mocks[id];
      throw new Error(`Unexpected dependency: ${id}`);
    },
    console, Date, Set, Map, Error, SyntaxError, URL, Request, Response, URLSearchParams, process: { env: { LEO_ALLOWED_EMAIL: "owner@willowed.org" } },
  }, { filename: path });
  return exports;
}

const states = moduleAt("src/types/partner-response.ts");
assert.equal(states.responseAfterMessage({ message_id: "10", status: "handled" }, "10", true, true), "handled", "reading or labeling must not reopen a handled item");
assert.equal(states.responseAfterMessage({ message_id: "10", status: "handled" }, "11", true, true), "needs_response", "new partner reply reopens handled work");
assert.equal(states.responseAfterMessage({ message_id: "10", status: "draft_ready" }, "11", false, true), "waiting", "outgoing reply moves to waiting");
assert.equal(states.responseAfterMessage(null, "11", true, false), "needs_input", "ambiguous partner requires input");
assert.equal(states.isStaleDraft({ draft: "Keep this", message_id: "11", draft_message_id: "10" }), true);

class GmailApiError extends Error { constructor(status) { super("Gmail error"); this.status = status; } }
const history = moduleAt("src/lib/gmail-history.ts", { "./gmail": { GmailApiError } });
assert.deepEqual(Array.from(history.changedThreadIds({ historyId: "99999999999999999999", history: [
  { messagesAdded: [{ message: { id: "1", threadId: "a" } }], messages: [{ id: "1", threadId: "a" }], labelsRemoved: [{ message: { id: "2", threadId: "b" } }] },
  { messagesDeleted: [{ message: { id: "3", threadId: "c" } }] },
] })), ["a", "b", "c"], "deduplicate all Gmail history event kinds");
const metadata = history.classifyMetadata({ id: "a", messages: [
  { id: "new", internalDate: "2000", labelIds: ["INBOX"], payload: { headers: [{ name: "From", value: "Partner <p@school.org>" }] } },
  { id: "draft", internalDate: "3000", labelIds: ["DRAFT"] },
  { id: "old", internalDate: "1000", labelIds: ["UNREAD"], payload: { headers: [] } },
] });
assert.equal(metadata.lastMessageId, "new", "unsent Gmail drafts cannot invalidate a response draft");
assert.equal(metadata.date, "1970-01-01T00:00:02.000Z", "use Gmail arrival timestamp");
assert.equal(metadata.unread, false, "old unread messages do not make the latest message unread");

function syncHarness(options = {}) {
  const state = { history_id: "100", page_token: null, pending_thread_ids: null, pending_history_id: null, last_checked_at: "old", ...options.state };
  const responses = new Map(options.rows ?? []);
  let reads = 0;
  const db = {
    rpc: async () => ({ data: !options.busy, error: null }),
    from(table) {
      const chain = {
        patch: null,
        update(patch) { this.patch = patch; return this; },
        insert(row) { responses.set(row.thread_id, row); return this; },
        select() { return this; }, eq() { return this; }, order() { return this; },
        range() { return this; },
        then(resolve) {
          if (table === "partner_mail_sync" && this.patch) Object.assign(state, this.patch);
          return Promise.resolve(resolve({ data: table === "partner_responses" ? [...responses.values()] : [], error: null }));
        },
      }; return chain;
    },
  };
  const sync = moduleAt("src/lib/partner-mail-sync.ts", {
    "node:crypto": { randomUUID: () => "lease" },
    "./crm-supabase": { isCrmConfigured: true, crmSupabase: { from: (table) => ({
      select() { return this; }, order() { return this; },
      range: async () => ({ data: table === "partners" ? [{ id: "p", name: "School" }] : [{ email: "person@school.org", partner_id: "p" }], error: null }),
    }) } },
    "./gmail": { GmailApiError },
    "./gmail-history": {
      gmailProfile: async () => ({ emailAddress: "owner@willowed.org", historyId: "300" }),
      gmailHistory: async () => { if (options.expired) throw new GmailApiError(404); return options.page ?? { historyId: "200", history: [{ messages: [{ id: "11", threadId: "thread" }] }] }; },
      initialThreadIds: async () => options.initialIds ?? ["thread"],
      recoveryThreadIds: async () => ["thread"],
      changedThreadIds: history.changedThreadIds,
      threadMetadata: async (_token, id) => {
        reads++;
        if (options.failRead) throw new Error("Rate limited");
        return { id, lastMessageId: "11", from: "person@school.org", date: "2026-09-08T13:00:00Z", subject: "Help", snippet: "Please help", participants: ["person@school.org"], labelIds: ["INBOX"], unread: false };
      },
    },
    "./mail-classify": { classifyInbox: async () => ({ buckets: {}, decisions: {}, urgentPartnerThreads: [] }) },
    "./partner-response-store": {
      responseDb: () => db, getMailSyncState: async () => ({ ...state }), getResponse: async (id) => responses.get(id) ?? null,
      updateResponse: async (id, version, patch) => {
        if (options.conflict) throw new Error("This response changed");
        const updated = { ...responses.get(id), ...patch, version: version + 1 }; responses.set(id, updated); return updated;
      },
      storeError: (error) => { throw error; },
    },
    "@/types/partner-response": states,
  });
  return { sync, state, responses, reads: () => reads };
}

const steady = syncHarness();
await steady.sync.syncPartnerMail("mock");
assert.equal(steady.state.history_id, "200");
assert.equal(steady.reads(), 1, "fetch only changed threads");
assert.equal(steady.responses.get("thread").status, "needs_response", "read emails still enter the response queue");

const idle = syncHarness({ page: { historyId: "200" } });
await idle.sync.syncPartnerMail("mock");
assert.equal(idle.reads(), 0, "no full inbox scan when no changes exist");

const failed = syncHarness({ failRead: true });
await assert.rejects(() => failed.sync.syncPartnerMail("mock"), /Rate limited/);
assert.equal(failed.state.history_id, "100", "failed page must not advance cursor");
assert.equal(failed.state.last_checked_at, "old", "failed check must not appear fresh");
assert.equal(failed.state.lock_id, null, "release lease after failure");

const paged = syncHarness({ page: { historyId: "99999999999999999999", nextPageToken: "next", history: [] } });
await paged.sync.syncPartnerMail("mock");
assert.equal(paged.state.history_id, "100", "retain starting cursor until final page");
assert.equal(paged.state.page_token, "next");
assert.equal(paged.state.last_checked_at, "old");

const existing = { thread_id: "tracked", version: 2, message_id: "10", draft: "Keep my edit", draft_message_id: "10", status: "handled" };
const recovery = syncHarness({ expired: true, rows: [["tracked", existing]] });
await recovery.sync.syncPartnerMail("mock");
assert.equal(recovery.state.history_id, "300");
assert.equal(recovery.responses.get("tracked").draft, "Keep my edit", "expired history must preserve drafts");
assert.equal(recovery.responses.get("tracked").status, "needs_response");

const initial = syncHarness({ state: { history_id: null }, initialIds: Array.from({ length: 75 }, (_, i) => `thread${i}`) });
await initial.sync.syncPartnerMail("mock");
assert.equal(initial.reads(), 50, "bootstrap is bounded and resumable");
assert.equal(initial.state.pending_thread_ids.length, 25);
assert.equal(initial.state.history_id, null);
await initial.sync.syncPartnerMail("mock");
assert.equal(initial.reads(), 75);
assert.equal(initial.state.history_id, "300");
assert.equal(initial.state.pending_thread_ids, null);

const conflicted = syncHarness({ conflict: true, rows: [["thread", { ...existing, thread_id: "thread" }]] });
await assert.rejects(() => conflicted.sync.syncPartnerMail("mock"), /changed/);
assert.equal(conflicted.state.history_id, "100", "concurrent user edits trigger safe replay");
const locked = syncHarness({ busy: true });
assert.equal((await locked.sync.syncPartnerMail("mock")).busy, true);
assert.equal(locked.reads(), 0);

const matcher = steady.sync.matchResponsePartner;
assert.equal(matcher(["new@gmail.com"], [{ email: "known@gmail.com", partner_id: "p" }], [{ id: "p", name: "School" }]), null, "never match a school through a shared public email domain");
assert.equal(matcher(["x@one.org", "y@two.org"], [{ email: "x@one.org", partner_id: "1" }, { email: "y@two.org", partner_id: "2" }], [{ id: "1", name: "One" }, { id: "2", name: "Two" }]), null, "ambiguous thread must not silently choose a partner");
let session = { user: { email: "owner@willowed.org", name: "Owner" }, accessToken: "mock" };
let apiItem = { thread_id: "thread", version: 1, message_id: "11", draft: "Original", draft_message_id: "11", status: "draft_ready" };
let metadataReads = 0;
let changedDuringDraft = false;
let writes = 0;
const api = moduleAt("src/app/api/partner-responses/route.ts", {
  "next-auth": { getServerSession: async () => session },
  "next/server": { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
  zod: { z },
  "@/lib/auth": { authOptions: {} },
  "@/lib/email-draft": { generateEmailDraft: async () => ({ draft: "New draft", sources: [] }) },
  "@/lib/gmail": { getThread: async () => ({ id: "thread", messages: [] }) },
  "@/lib/gmail-history": { threadMetadata: async () => ({ lastMessageId: ++metadataReads > 1 && changedDuringDraft ? "12" : "11" }) },
  "@/lib/partner-mail-sync": { syncPartnerMail: async () => ({ complete: true }) },
  "@/lib/partner-response-store": {
    responseStoreConfigured: true, getResponse: async () => apiItem,
    updateResponse: async (_id, version, patch) => {
      if (version !== apiItem.version) throw new Error("Response changed in another tab");
      writes++; apiItem = { ...apiItem, ...patch, version: version + 1 }; return apiItem;
    },
  },
});
const request = (method, body) => new Request("https://leo.test/api/partner-responses", { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
session = null;
assert.equal((await api.PATCH(request("PATCH", { threadId: "thread", version: 1, draft: "No" }))).status, 401);
session = { user: { email: "other@school.org" }, accessToken: "mock" };
assert.equal((await api.POST(request("POST", { action: "sync" }))).status, 401, "reject a different user's session");
session = { user: { email: "owner@willowed.org" }, accessToken: "mock" };
assert.equal((await api.PATCH(request("PATCH", { threadId: "thread", version: 1, partner_id: "unauthorized" }))).status, 400, "only explicit editable fields are accepted");
assert.equal((await api.PATCH(request("PATCH", { threadId: "thread", version: 1, follow_up_on: "2026-02-30" }))).status, 400);
assert.equal((await api.PATCH(request("PATCH", { threadId: "thread", version: 1, draft: "", status: "draft_ready" }))).status, 400, "an empty reply is not draft-ready");
assert.equal((await api.PATCH(request("PATCH", { threadId: "thread", version: 1, draft: "Edited", status: "handled" }))).status, 200);
assert.equal(apiItem.status, "handled", "saving edited text must honor an explicit handled decision");
assert.equal((await api.PATCH(request("PATCH", { threadId: "thread", version: 1, notes: "Old tab" }))).status, 409);
assert.equal(writes, 1, "invalid and stale requests must not write");
changedDuringDraft = true;
assert.equal((await api.POST(request("POST", { action: "draft", threadId: "thread", version: 2 }))).status, 409, "a reply arriving mid-generation prevents saving an outdated draft");
assert.equal(apiItem.draft, "Edited");
assert.equal(writes, 1);
changedDuringDraft = false;
metadataReads = 0;
assert.equal((await api.POST(request("POST", { action: "draft", threadId: "thread", version: 2 }))).status, 200);
assert.equal(apiItem.draft, "New draft");
assert.equal(apiItem.draft_message_id, "11");

const ui = moduleAt("src/components/PartnerResponseQueue.tsx", {
  react: React, "react/jsx-runtime": jsxRuntime, "lucide-react": icons,
  "@/lib/http": {}, "@/types/partner-response": states,
  "./PartnerPreparationStatus": { default: () => null },
}, "\nexport { ResponseEditor };\n");
const markup = renderToStaticMarkup(React.createElement(ui.ResponseEditor, {
  item: {
    ...apiItem, draft_message_id: "old", partner_name: "Example school", sender: "person@school.org",
    subject: "<script>alert(1)</script>", notes: "My direction", reason: "Review the request", follow_up_on: null,
    updated_at: "2026-09-08T13:00:00Z",
    draft_sources: [{ id: "safe", title: "Source document", url: "https://docs.google.com/document/d/example/edit" }, { id: "bad", title: "Unsafe URL", url: "javascript:alert(1)" }],
  }, onBack() {}, onSaved() {},
}));
assert.match(markup, /href="\/mail\?thread=thread"/, "open the exact conversation from the queue");
assert.match(markup, /This draft is from an earlier message/);
assert.match(markup, /Previous drafts/);
assert.match(markup, /https:\/\/docs.google.com\/document\/d\/example\/edit/);
assert.doesNotMatch(markup, /href="javascript:/, "do not render unsafe source links");
assert.doesNotMatch(markup, /<script>/, "email-derived text must be escaped");
console.log("Partner queue regression checks passed (offline, no external writes).");
