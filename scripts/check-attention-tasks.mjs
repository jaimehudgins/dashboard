// Offline only. No Gmail, Supabase, model, or TEMU calls.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { z } from "zod";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";
const helpers = moduleAt("src/lib/email-task.ts");
assert.equal(helpers.normalizedTaskTitle("  Add   STAFF "), "add staff");
assert.equal(helpers.taskBelongsToThread({ link: "https://mail.google.com/mail/u/0/#all/abc123", description: null }, "abc123"), true);
assert.equal(helpers.taskBelongsToThread({ link: "https://mail.google.com/mail/u/0/#all/abc1234", description: null }, "abc123"), false);
const item = { thread_id: "abc123", message_id: "m1", subject: "Staff access", partner_name: "Believe", status: "needs_input", response_assessment: { message_id: "m1", reason: "Add the named ALMA reviewers" } };
let messages = [{ id: "m1", from: "Partner", date: "2026-09-11", cleanBody: "Add Ana. See https://docs.google.com/document/d/example/edit. javascript:bad", body: "" }];
const preview = helpers.emailTaskPreview(item, messages);
assert.equal(preview.title, item.response_assessment.reason);
assert.match(preview.notes, /Add Ana/);
assert.deepEqual(Array.from(preview.links), ["https://docs.google.com/document/d/example/edit"]);
assert.match(helpers.emailTaskPreview(item, [{ ...messages[0], id: "m2" }]).title, /^Follow up:/);
let rows = [], writes = [], failRead = false, failInsert = false, race = false;
const db = { from(table) {
  assert.ok(["tasks", "areas"].includes(table), "no response/CRM writes");
  let insertion, filterId;
  const query = {
    select() { return query; }, or() { return query; }, limit() { return query; },
    eq(_key, id) { filterId = id; return query; }, insert(input) { insertion = input; return query; },
    single() { return execute(); }, then(resolve, reject) { return execute().then(resolve, reject); },
  };
  async function execute() {
    if (table === "areas") return { data: [{ id: "partner-area", name: "Partner Success" }], error: null };
    if (insertion) {
      writes.push(insertion);
      if (failInsert) return { data: null, error: { code: "unknown" } };
      if (race) { race = false; rows.push({ ...insertion }); return { data: null, error: { code: "23505" } }; }
      rows.push({ ...insertion }); return { data: insertion, error: null };
    }
    if (failRead) return { data: null, error: { message: "offline" } };
    return { data: filterId ? rows.find((row) => row.id === filterId) : rows, error: null };
  }
  return query;
} };
const store = moduleAt("src/lib/attention-tasks.ts", { "node:crypto": crypto, "./partner-response-store": { responseDb: () => db }, "./email-task": helpers });
assert.equal(store.emailTaskId("abc123", "Add staff"), store.emailTaskId("abc123", " ADD  STAFF "));
assert.notEqual(store.emailTaskId("abc123", "Add staff"), store.emailTaskId("other", "Add staff"));
let session = { user: { email: "owner@willowed.org" }, accessToken: "fake" };
const api = moduleAt("src/app/api/partner-responses/tasks/route.ts", {
  "next/server": { NextResponse: Response }, "next-auth": { getServerSession: async () => session }, zod: { z },
  "@/lib/auth": { authOptions: {} }, "@/lib/partner-response-store": { getResponse: async () => item },
  "@/lib/gmail": { getThread: async () => ({ messages }) }, "@/lib/attention-tasks": store, "@/lib/email-task": helpers,
}, { LEO_ALLOWED_EMAIL: "owner@willowed.org" });
const input = { threadId: "abc123", messageId: "m1", confirmed: true, title: "Add staff", notes: "Create Ana's access", dueDate: "2026-12-12", links: ["https://docs.google.com/document/d/example/edit"] };
const post = (body = input) => api.POST(new Request("https://leo.test/api/partner-responses/tasks", { method: "POST", body: JSON.stringify(body) }));
assert.equal((await api.GET(new Request("https://leo.test/api/partner-responses/tasks?threadId=abc123&preview=1"))).status, 200);
assert.equal(writes.length, 0);
const created = await post(); assert.equal(created.status, 200); assert.equal((await created.json()).existing, false);
assert.equal(writes.length, 1); assert.equal(writes[0].status, "pending"); assert.equal(writes[0].area_id, "partner-area");
assert.match(writes[0].description, /Source message: m1/); assert.match(writes[0].description, /Related links/);
assert.equal(writes[0].due_date, "2026-12-12T18:00:00Z"); assert.equal(item.status, "needs_input");
assert.equal((await (await post()).json()).existing, true); assert.equal(writes.length, 1);
rows[0].status = "completed";
assert.equal((await (await post()).json()).task.status, "completed"); assert.equal(writes.length, 1);
for (const patch of [{ confirmed: false }, { dueDate: "2026-02-30" }, { links: ["javascript:alert(1)"] }, { title: " " }]) assert.equal((await post({ ...input, ...patch })).status, 400);
messages = [{ ...messages[0], id: "m2" }]; assert.equal((await post()).status, 409); assert.equal(writes.length, 1);
messages = [{ ...messages[0], id: "m1" }];
session = { user: { email: "someoneelse@willowed.org" }, accessToken: "fake" };
assert.equal((await post()).status, 401); assert.equal(writes.length, 1);
session = { user: { email: "owner@willowed.org" }, accessToken: "fake" };
failRead = true; assert.equal((await post({ ...input, title: "Another action" })).status, 500); assert.equal(writes.length, 1);
failRead = false; race = true;
assert.equal((await (await post({ ...input, title: "Another action" })).json()).existing, true);
assert.equal(writes.length, 2); assert.equal(rows.length, 2);
failInsert = true; assert.equal((await post({ ...input, title: "Failure" })).status, 500); assert.equal(writes.length, 3);
console.log("Attention tasks passed: source preview, auth, confirmation, dates/URLs, new-message guard, duplicate/race protection, completed links, and failure handling. No external writes.");
