// Offline only: no Google, model, Supabase, Slack, or CRM requests.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as jsx from "react/jsx-runtime";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";

const env = { LEO_ALLOWED_EMAIL: "owner@willowed.org" };
const policy = moduleAt("src/lib/response-needed-policy.ts");
const scopes = moduleAt("src/types/response-reassessment.ts");
const runId = "c02e989b-19c5-479e-ac6e-f8df0bb64746";
const original = { thread_id: "thread", message_id: "old", version: 3, status: "waiting", partner_name: "School", notes: "Keep notes", draft: "Keep draft", follow_up_on: "2026-09-11" };
const target = { threadId: "thread", version: 3 };
const metadata = { lastMessageId: "sent", from: env.LEO_ALLOWED_EMAIL, subject: "All set", snippet: "All set", date: "2026-09-10T12:00:00Z", labelIds: ["INBOX", "SENT"] };
function harness(options = {}) {
  let row = { ...original, ...options.item };
  const patches = [];
  let assessments = 0;
  const latest = { ...metadata, ...options.metadata };
  const service = moduleAt("src/lib/response-reassessment.ts", {
    "./partner-response-store": {
      getResponse: async () => options.missing ? null : { ...row },
      updateResponse: async (_id, version, patch) => {
        if (options.conflict || version !== row.version) throw new Error("Concurrent edit");
        patches.push(patch); row = { ...row, ...patch, version: row.version + 1 }; return row;
      },
    },
    "./gmail-history": {
      gmailProfile: async () => ({ emailAddress: options.wrongAccount ? "other@willowed.org" : env.LEO_ALLOWED_EMAIL }),
      threadMetadata: async () => options.noThread ? null : latest,
      isOwnReply: (message, email) => message.from === email,
    },
    "./partner-response-policy": { previewResponseAssessment: async (_token, snapshot) => {
      assessments++;
      assert.equal(snapshot.message_id, latest.lastMessageId, "assess the latest email, not stale queued mail");
      if (options.failure) throw new Error("Model/retrieval failed");
      return { latest, assessment: { message_id: latest.lastMessageId, decision: options.decision ?? "no_reply", confidence: options.confidence ?? "high", reason: "Resolved", assessed_at: "now", waiting_question: options.question ?? null } };
    } },
    "./response-needed-policy": policy,
    "@/types/response-reassessment": scopes,
  }, env);
  return { service, patches, row: () => row, assessments: () => assessments, latest };
}
let h = harness();
let result = await h.service.reassessConversation("mock", target, runId);
assert.equal(result.canClose, true);
assert.equal(h.row().status, "needs_input", "reassessment never closes automatically");
assert.equal(h.row().message_id, "sent");
assert.equal(h.row().draft, original.draft);
assert.equal(h.row().notes, original.notes);
assert.equal(h.row().follow_up_on, original.follow_up_on);
assert.equal(h.row().response_assessment.bulk_run_id, runId);
await h.service.approveReassessedClosure("mock", { threadId: result.threadId, version: result.version, messageId: result.messageId }, runId);
assert.equal(h.row().status, "handled");
assert.equal(h.row().follow_up_on, null);
assert.equal(h.row().draft, original.draft);
assert.equal(h.row().response_correction.decision, "no_reply");
await assert.rejects(() => h.service.approveReassessedClosure("mock", { threadId: result.threadId, version: result.version, messageId: result.messageId }, runId));
assert.equal(h.patches.length, 2, "duplicate approval cannot write twice");

for (const options of [{ missing: true }, { item: { version: 4 } }, { item: { status: "handled" } }, { wrongAccount: true }, { noThread: true }, { metadata: { labelIds: ["TRASH"] } }, { failure: true }, { conflict: true }]) {
  h = harness(options);
  await assert.rejects(() => h.service.reassessConversation("mock", target, runId));
  assert.equal(h.patches.length, 0, "failed or stale reassessment leaves saved work unchanged");
}
h = harness({ item: { message_id: "sent", response_correction: { message_id: "sent", decision: "waiting" } } });
result = await h.service.reassessConversation("mock", target, runId);
assert.equal(result.protectedDecision, true);
assert.equal(result.canClose, false);
assert.equal(h.row().status, "waiting");
assert.equal(h.assessments(), 1, "show a fresh suggestion even when the human decision is protected");
h = harness({ item: { response_correction: { message_id: "old", decision: "waiting" } }, metadata: { from: "partner@example.org", lastMessageId: "new-partner" }, decision: "reply_needed" });
result = await h.service.reassessConversation("mock", target, runId);
assert.equal(result.protectedDecision, false, "new incoming email invalidates old correction");
assert.equal(result.status, "needs_response");
assert.equal(h.row().draft, original.draft, "keep unsent draft but do not present it as current");
h = harness({ decision: "waiting", question: { message_id: "sent", text: "Which date?" } });
assert.equal((await h.service.reassessConversation("mock", target, runId)).status, "waiting");
for (const options of [{ confidence: "low" }, { decision: "action_only" }, { decision: "judgment" }]) {
  h = harness(options); result = await h.service.reassessConversation("mock", target, runId);
  assert.equal(result.canClose, false); assert.equal(result.status, "needs_input");
}
for (const change of ["message", "version", "run", "decision", "protected"]) {
  h = harness(); result = await h.service.reassessConversation("mock", target, runId);
  const reviewed = { threadId: result.threadId, version: result.version, messageId: result.messageId };
  if (change === "message") h.latest.lastMessageId = "new";
  if (change === "version") reviewed.version--;
  if (change === "decision") h.row().response_assessment.decision = "action_only";
  if (change === "protected") h.row().response_correction = { message_id: "sent", decision: "waiting" };
  await assert.rejects(() => h.service.approveReassessedClosure("mock", reviewed, change === "run" ? "different" : runId));
  assert.equal(h.patches.length, 1, `${change} prevents closure`);
}

// Real route: authorized owner only, explicit confirmation, strict payload,
// bounded one-item POSTs, and complete keyset pagination across >50 items.
let session = { user: { email: env.LEO_ALLOWED_EMAIL }, accessToken: "mock" };
let ready = true;
let actionCalls = 0;
const rows = Array.from({ length: 112 }, (_, i) => ({ thread_id: `t${String(i).padStart(3, "0")}`, version: 1, status: ["waiting", "draft_ready", "needs_input", "needs_response"][i % 4] }));
rows.push({ thread_id: "z-handled", version: 1, status: "handled" });
const actionScopes = [];
const route = moduleAt("src/app/api/partner-responses/reassess/route.ts", {
  "next-auth": { getServerSession: async () => session }, "next/server": { NextResponse: Response }, zod: { z }, "@/lib/auth": {},
  "@/lib/partner-response-policy": { responsePolicyStatus: async () => ({ ready, enabled: true }) },
  "@/lib/response-reassessment": { reassessConversation: async (_token, _target, _runId, scope) => { actionCalls++; actionScopes.push(scope); return {}; }, approveReassessedClosure: async () => { actionCalls++; } },
  "@/types/response-reassessment": scopes,
  "@/lib/partner-response-store": { responseDb: () => ({ from: (table) => {
    assert.equal(table, "partner_responses"); let cursor = "", statuses = [];
    return { select() { return this; }, in(key, values) { assert.equal(key, "status"); statuses = values; return this; }, order(key) { assert.equal(key, "thread_id"); return this; }, limit(n) { assert.equal(n, 51); return this; }, gt(key, value) { assert.equal(key, "thread_id"); cursor = value; return this; }, then(resolve) { resolve({ data: rows.filter((row) => row.thread_id > cursor && statuses.includes(row.status)).slice(0, 51), error: null }); } };
  } }) },
}, env);
const request = (body) => new Request("https://leo.test/api/partner-responses/reassess", { method: "POST", body: JSON.stringify(body) });
const body = { action: "assess", ...target, runId };
for (const bad of [null, { user: { email: "other@example.org" }, accessToken: "mock" }, { user: { email: env.LEO_ALLOWED_EMAIL }, accessToken: "mock", error: "RefreshAccessTokenError" }]) {
  session = bad; assert.equal((await route.POST(request(body))).status, 401);
  assert.equal((await route.GET(new Request("https://leo.test/api/partner-responses/reassess"))).status, 401);
}
session = { user: { email: env.LEO_ALLOWED_EMAIL }, accessToken: "mock" };
for (const bad of [{ ...body, action: "approve", messageId: "sent" }, { ...body, status: "handled" }, { ...body, runId: "invalid" }]) assert.equal((await route.POST(request(bad))).status, 400);
assert.equal(actionCalls, 0);
ready = false; assert.equal((await route.POST(request(body))).status, 503); assert.equal(actionCalls, 0); ready = true;
assert.equal((await route.POST(request(body))).status, 200);
assert.equal((await route.POST(request({ ...body, action: "approve", messageId: "sent", confirmed: true }))).status, 200);
assert.equal(actionCalls, 2);
assert.deepEqual(actionScopes, ["open"], "POST defaults to All open, never Handled");
let cursor = null;
const seen = [];
do {
  const response = await route.GET(new Request(`https://leo.test/api/partner-responses/reassess${cursor ? `?cursor=${cursor}` : ""}`));
  const page = await response.json(); seen.push(...page.items); cursor = page.cursor;
} while (cursor);
assert.equal(seen.length, 112); assert.equal(new Set(seen.map((row) => row.threadId)).size, 112);
assert.equal(seen.some((row) => row.threadId === "z-handled"), false);
for (const [scope, expected] of [["waiting", 28], ["all", 113]]) {
  let cursor = null; const selected = [];
  do {
    const response = await route.GET(new Request(`https://leo.test/api/partner-responses/reassess?scope=${scope}${cursor ? `&cursor=${cursor}` : ""}`));
    const page = await response.json(); selected.push(...page.items); cursor = page.cursor;
  } while (cursor);
  assert.equal(selected.length, expected);
}
assert.equal((await route.GET(new Request("https://leo.test/api/partner-responses/reassess?scope=invalid"))).status, 400);
assert.equal((await route.POST(request({ ...body, scope: "invalid" }))).status, 400);

// Every open designation is eligible, but a still-current prepared draft keeps
// its ready status and text. A handled conversation is opt-in and protected.
for (const status of ["needs_response", "draft_ready", "needs_input", "waiting"]) {
  h = harness({ item: { status, message_id: "sent", draft_message_id: "sent" }, decision: "reply_needed", metadata: { from: "partner@example.org" } });
  result = await h.service.reassessConversation("mock", target, runId, "open");
  assert.equal(h.row().draft, original.draft);
  if (status === "draft_ready") assert.equal(result.status, "draft_ready");
  if (status !== "waiting") {
    h = harness({ item: { status } });
    await assert.rejects(() => h.service.reassessConversation("mock", target, runId, "waiting"));
    assert.equal(h.patches.length, 0);
  }
}
for (const options of [
  { item: { status: "handled", message_id: "sent" }, metadata: { from: "partner@example.org" } },
  { item: { status: "handled" } },
]) {
  h = harness({ ...options, decision: "reply_needed" });
  await assert.rejects(() => h.service.reassessConversation("mock", target, runId, "open"));
  result = await h.service.reassessConversation("mock", target, runId, "all");
  assert.equal(result.status, "handled"); assert.equal(result.protectedDecision, true); assert.equal(result.canClose, false);
}
h = harness({ item: { status: "handled", response_correction: { message_id: "old", decision: "no_reply" } }, metadata: { from: "partner@example.org" }, decision: "reply_needed" });
result = await h.service.reassessConversation("mock", target, runId, "all");
assert.equal(result.status, "needs_response", "a new incoming message reopens handled work, as normal mail sync does");

// Component interactions with synthetic React hooks and fetch. Ensures bulk
// scope is collected before writes and closure is a separate explicit action.
function uiHarness(pauseFirst = false) {
  let states = [], refs = [], stateIndex = 0, refIndex = 0, release;
  const calls = [];
  const exports = {};
  const mocks = {
    react: { useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; }, useRef(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; }, useEffect() {} },
    "react/jsx-runtime": jsx, "@/lib/http": { readJsonResponse: (response) => response.json() }, "@/lib/response-needed-policy": policy,
    "@/types/response-reassessment": scopes,
  };
  const code = ts.transpileModule(fs.readFileSync("src/components/ResponseReassessment.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, Error, require: (id) => { assert.ok(id in mocks, id); return mocks[id]; }, crypto: { randomUUID: () => runId }, Event, window: { dispatchEvent() {} }, fetch: async (url, options) => {
    calls.push(options?.method === "POST" ? JSON.parse(options.body) : url);
    if (options?.method !== "POST") return Response.json(url.includes("cursor") ? { items: [{ threadId: "b", version: 1 }], cursor: null } : { items: [{ threadId: "a", version: 1 }], cursor: "a" });
    const input = JSON.parse(options.body);
    if (input.action === "approve") return Response.json({ ok: true });
    if (pauseFirst && input.threadId === "a") await new Promise((resolve) => { release = resolve; });
    return Response.json({ result: { threadId: input.threadId, version: 2, messageId: "sent", subject: "Resolved conversation", partner: "School", status: "needs_input", decision: "no_reply", reason: "All resolved", protectedDecision: false, canClose: true } });
  } });
  const render = () => { stateIndex = 0; refIndex = 0; return exports.default({ enabled: true, counts: { waiting: 2, handled: 1, needs_input: 1 } }); };
  const nodes = (node, type) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap((child) => nodes(child, type)) : [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)];
  const text = (node) => typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : "";
  const button = (label) => nodes(render(), "button").find((node) => text(node).startsWith(label));
  return { calls, button, inputs: () => nodes(render(), "input"), select: () => nodes(render(), "select")[0], states: () => states, release: () => release() };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
let ui = uiHarness();
ui.button("Reassess conversations").props.onClick();
assert.equal(ui.select().props.value, "open");
const start = ui.button("Start new"); start.props.onClick(); start.props.onClick();
await tick();
assert.equal(ui.calls.length, 4, `double click cannot start another batch: ${JSON.stringify(ui.states())}`);
assert.equal(typeof ui.calls[0], "string"); assert.equal(typeof ui.calls[1], "string", "collect all pages before assessing");
assert.match(ui.calls[0], /scope=open/);
assert.equal(ui.calls[2].scope, "open");
assert.equal(ui.calls.filter((call) => call.action === "approve").length, 0);
ui.inputs()[0].props.onChange({ target: { checked: true } });
ui.button("Approve selected").props.onClick();
assert.equal(ui.calls.filter((call) => call.action === "approve").length, 0, "review confirmation does not close anything");
const confirm = ui.button("Confirm selected"); confirm.props.onClick(); confirm.props.onClick(); await tick();
assert.equal(ui.calls.filter((call) => call.action === "approve").length, 1);
assert.equal(ui.states()[3][0].approved, true);
ui = uiHarness(true); ui.button("Reassess conversations").props.onClick(); ui.select().props.onChange({ target: { value: "waiting" } }); ui.button("Start new").props.onClick(); await tick();
assert.equal(ui.select().props.disabled, true);
ui.button("Stop after").props.onClick(); ui.release(); await tick();
assert.equal(ui.calls.filter((call) => call.action === "assess").length, 1);
ui.button("Resume").props.onClick(); await tick();
assert.equal(ui.calls.filter((call) => call.action === "assess").length, 2);
assert.equal(ui.calls.filter((call) => typeof call === "string").length, 2, "resume reuses the same snapshot");
assert.ok(ui.calls.filter((call) => call.action === "assess").every((call) => call.scope === "waiting"));
ui = uiHarness(); ui.button("Reassess conversations").props.onClick(); ui.select().props.onChange({ target: { value: "all" } }); ui.button("Start new").props.onClick(); await tick();
assert.match(ui.calls[0], /scope=all/);
assert.ok(ui.calls.filter((call) => call.action === "assess").every((call) => call.scope === "all"));
console.log("Bulk reassessment checks passed: scope, latest mail, protected decisions, failures, explicit closure, races, auth, pagination, UI stop/resume and double-click guards (offline).");
