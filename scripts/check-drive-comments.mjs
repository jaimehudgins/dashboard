// Offline regression checks: no Google, Supabase, email or CRM writes.
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { z } from "zod";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";

const calls = [];
let transport = async () => Response.json({});
const drive = moduleAt("src/lib/drive-comments.ts", { "node:crypto": crypto }, {}, "", {
  AbortSignal, fetch: async (url, options) => { calls.push({ url, options }); return transport(url, options); },
});
const source = { id: "c1", content: "Please update the lesson", modifiedTime: "2026-09-11T12:00:00Z", resolved: false,
  quotedFileContent: { mimeType: "text/html", value: "<b>Lesson &amp; activity</b>" }, replies: [] };
const revision = drive.commentRevision(source);
assert.equal(drive.plainCommentQuote(source), "Lesson & activity");
assert.notEqual(revision, drive.commentRevision({ ...source, content: "Edited" }));
assert.notEqual(revision, drive.commentRevision({ ...source, resolved: true }));
assert.notEqual(revision, drive.commentRevision({ ...source, replies: [{ id: "r1", content: "New request" }] }));
assert.notEqual(drive.commentTaskId("f1", "c1"), drive.commentTaskId("f2", "c1"));
assert.equal(drive.commentTaskId("f1", "c1"), drive.commentTaskId("f1", "c1"));
transport = async (url) => Response.json(url.includes("pageToken") ? { comments: [{ id: "c2" }] } : { comments: [source], nextPageToken: "next" });
assert.equal((await drive.listDriveComments("fake", "f1")).length, 2);
assert.ok(calls.every(({ url, options }) => url.includes("fields=") && options.cache === "no-store"));
transport = async () => Response.json({ comments: [], nextPageToken: "loop" });
await assert.rejects(drive.listDriveComments("fake", "f1"), /too many comments/);
transport = async () => new Response("private token details", { status: 403 });
await assert.rejects(drive.getCommentFile("fake", "f1"), (error) => error.definitive && !error.message.includes("private"));

const tables = { leo_comment_files: [{ id: "f1", name: "Pilot file" }], leo_comment_decisions: [], leo_comment_writes: [], tasks: [] };
const key = (table, row) => table === "tasks" || table === "leo_comment_files" ? row.id : [row.file_id, row.comment_id, row.revision].join(":");
const db = { from(table) {
  assert.ok(table in tables, `Unexpected table ${table}`);
  let mode = "read", values, single = false, cap = Infinity;
  const filters = [];
  const query = {
    select() { return this; }, order() { return this; }, limit(n) { cap = n; return this; },
    eq(field, value) { filters.push((row) => row[field] === value); return this; },
    in(field, values) { filters.push((row) => values.includes(row[field])); return this; },
    match(values) { for (const [field, value] of Object.entries(values)) this.eq(field, value); return this; },
    insert(data) { mode = "insert"; values = data; return this; },
    upsert(data) { mode = "upsert"; values = data; return this; },
    update(data) { mode = "update"; values = data; return this; },
    delete() { mode = "delete"; return this; },
    maybeSingle() { single = true; return this; }, single() { single = true; return this; },
    then(resolve, reject) { return Promise.resolve().then(() => {
      if (mode === "insert" || mode === "upsert") {
        const existing = tables[table].find((row) => key(table, row) === key(table, values));
        if (existing && mode === "insert") return { data: null, error: { code: "23505" } };
        if (existing) Object.assign(existing, values); else tables[table].push({ ...values });
      }
      let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (mode === "update") rows.forEach((row) => Object.assign(row, values));
      if (mode === "delete") tables[table] = tables[table].filter((row) => !rows.includes(row));
      if (mode === "insert") rows = [tables[table].find((row) => key(table, row) === key(table, values))];
      return { data: single ? rows[0] ?? null : rows.slice(0, cap), error: null };
    }).then(resolve, reject); },
  };
  return query;
} };
const store = moduleAt("src/lib/drive-comment-store.ts", { "node:crypto": crypto, "./partner-response-store": { responseDb: () => db }, "./drive-comments": drive });
const beforeDecisionCalls = calls.length;
await store.decideComment("f1", source, "no_action");
assert.equal(calls.length, beforeDecisionCalls, "local decision never calls Google");
assert.equal((await store.decorateComments("f1", [source]))[0].status, "no_action");
assert.equal((await store.decorateComments("f1", [{ ...source, replies: [{ id: "new", content: "Another request" }] }]))[0].status, "review");
await store.createCommentTask(tables.leo_comment_files[0], source, "Update lesson", "My notes");
assert.match(tables.tasks[0].description, /My notes/);
assert.match(tables.tasks[0].description, /Comment ID: c1/);
assert.match(tables.tasks[0].description, /https:\/\/drive.google.com\/file\/d\/f1\/view/);
tables.tasks[0].status = "completed";
assert.equal((await store.createCommentTask(tables.leo_comment_files[0], source, "Changed title", "More")).existing, true);
assert.equal(tables.tasks.length, 1); assert.equal(tables.tasks[0].status, "completed");
assert.equal((await store.decorateComments("f1", [source]))[0].task.status, "completed");

let googleWrites = 0;
transport = async (_url, options) => { assert.equal(options.method, "POST"); googleWrites++; return Response.json({ id: "r-written" }); };
await Promise.allSettled([store.confirmedCommentWrite("fake", "f1", source, "reply", "Reviewed reply"), store.confirmedCommentWrite("fake", "f1", source, "reply", "Reviewed reply")]);
assert.equal(googleWrites, 1, "concurrent duplicate submits post once");
assert.equal(tables.leo_comment_writes[0].reply_id, "r-written");
transport = async () => { googleWrites++; throw new Error("Lost response"); };
const uncertain = { ...source, id: "uncertain" };
await assert.rejects(store.confirmedCommentWrite("fake", "f1", uncertain, "reply", "Hello"), /uncertain/);
await assert.rejects(store.confirmedCommentWrite("fake", "f1", uncertain, "reply", "Hello"), /already attempted/);
assert.equal(googleWrites, 2, "uncertain writes cannot be retried");
transport = async () => new Response("denied", { status: 403 });
await assert.rejects(store.confirmedCommentWrite("fake", "f1", { ...source, id: "denied" }, "resolve"), /denied/);
assert.equal(tables.leo_comment_writes.some((row) => row.comment_id === "denied"), false, "explicit rejection releases claim");
transport = async (_url, options) => { assert.deepEqual(JSON.parse(options.body), { action: "resolve" }); return Response.json({ id: "resolved" }); };
await store.confirmedCommentWrite("fake", "f1", { ...source, id: "resolve" }, "resolve");
assert.equal(tables.tasks[0].status, "completed", "resolution does not change tasks");

let session = { user: { email: "owner@example.com" }, accessToken: "fake", googleScope: drive.COMMENT_SCOPE };
let live = { ...source, id: "api" }, canComment = true, appAuthorized = true;
const env = { LEO_ALLOWED_EMAIL: "owner@example.com", GOOGLE_DRIVE_COMMENTS_ENABLED: "true" };
const route = moduleAt("src/app/api/drive-comments/route.ts", {
  "next/server": { NextResponse: Response }, "next-auth": { getServerSession: async () => session }, zod: { z },
  "@/lib/auth": { authOptions: {} }, "@/lib/drive-comment-store": store,
  "@/lib/drive-comments": { ...drive, getDriveComment: async () => live, getCommentFile: async () => ({ id: "f1", name: "Pilot file", isAppAuthorized: appAuthorized, capabilities: { canComment } }) },
}, env);
const input = { fileId: "f1", commentId: "api", revision: drive.commentRevision(live), action: "reply", content: "Approved", confirmed: true };
const post = (body = input, origin = "https://leo.test") => route.POST(new Request("https://leo.test/api/drive-comments", { method: "POST", headers: { Origin: origin }, body: JSON.stringify(body) }));
assert.equal((await post(input, "https://other.test")).status, 403);
session = null; assert.equal((await post()).status, 401);
session = { user: { email: "wrong@example.com" }, accessToken: "fake" }; assert.equal((await post()).status, 401);
session = { user: { email: "owner@example.com" }, accessToken: "fake", googleScope: drive.COMMENT_SCOPE };
assert.equal((await post({ ...input, confirmed: false })).status, 400);
assert.equal((await post({ ...input, fileId: "not-connected" })).status, 404);
assert.equal((await post({ ...input, revision: "0".repeat(64) })).status, 409);
env.GOOGLE_DRIVE_COMMENTS_ENABLED = "false"; assert.equal((await post()).status, 403);
env.GOOGLE_DRIVE_COMMENTS_ENABLED = "true"; session.googleScope = "readonly"; assert.equal((await post()).status, 403);
session.googleScope = drive.COMMENT_SCOPE;
canComment = false; assert.equal((await post()).status, 403); canComment = true;
appAuthorized = false; assert.equal((await post()).status, 403); appAuthorized = true;
live.resolved = true;
assert.equal((await post({ ...input, revision: drive.commentRevision(live) })).status, 409);
live.resolved = false;
transport = async (_url, options) => { assert.deepEqual(JSON.parse(options.body), { content: "Approved" }); return Response.json({ id: "approved" }); };
assert.equal((await post()).status, 200);
assert.equal((await post()).status, 409);
console.log("Drive comments passed: pagination, revision/reopen decisions, private local triage, linked/deduplicated tasks, auth/origin/scope/file guards, confirmations, duplicate writes, uncertain writes, and reply/resolve payloads. No external writes.");
