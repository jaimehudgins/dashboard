// Offline only: native route/Gmail functions, synthetic Gmail and DB transports.
import assert from "node:assert/strict";
import { z } from "zod";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

const types = moduleAt("src/types/partner-response.ts");
const history = moduleAt("src/lib/gmail-history.ts", { "./gmail": {} });
const original = { thread_id: "thread", version: 3, message_id: "incoming", draft_message_id: "incoming", draft: "My reviewed reply", notes: "Keep these notes", status: "draft_ready" };
const reply = { to: "Partner <reply@school.example>", from: "person@school.example", subject: "Re: Help", messageId: "incoming", sent: false, inReplyTo: "<message@school>", references: "<previous@school> <message@school>" };
const session = { accessToken: "synthetic", user: { email: "owner@willowed.org" } };
const confirmation = { threadId: "thread", version: 3, confirmed: true, expectedMessageId: reply.messageId, expectedTo: reply.to, expectedSubject: reply.subject };

function fixture(options = {}) {
  let row = { ...original, ...options.item };
  let reads = 0;
  let writes = 0;
  const deliveries = [];
  const api = moduleAt("src/app/api/partner-responses/send/route.ts", {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => options.session === undefined ? session : options.session },
    zod: { z }, "@/lib/auth": {}, "@/types/partner-response": types,
    "@/lib/gmail-history": history,
    "@/lib/gmail": {
      async getReplyContext() { reads++; return { ...reply, ...options.context, ...(reads > 1 ? options.afterClaim : {}) }; },
      async sendEmail(token, input, thread) {
        assert.equal(token, "synthetic");
        deliveries.push({ input, thread });
        if (options.sendFails) throw new Error("Synthetic lost receipt");
        return { id: "sent-message", threadId: thread };
      },
    },
    "@/lib/partner-response-store": {
      async getResponse() { return options.missing ? null : { ...row }; },
      async updateResponse(thread, version, patch) {
        assert.equal(thread, "thread");
        if (version !== row.version || options.claimFails || (writes > 0 && options.queueFails)) throw new Error("Synthetic conflict");
        writes++;
        row = { ...row, ...patch, version: row.version + 1 };
        return { ...row };
      },
    },
  });
  return { api, deliveries, row: () => row, writes: () => writes };
}
const get = () => new Request("https://leo.example/api/partner-responses/send?threadId=thread&version=3");
const post = (patch = {}) => new Request("https://leo.example/api/partner-responses/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...confirmation, ...patch }) });
let checks = 0;
async function blocked(label, options, status = 409, patch = {}) {
  const f = fixture(options);
  const result = await f.api.POST(post(patch));
  assert.equal(result.status, status, label);
  assert.equal(f.deliveries.length, 0, `${label}: no email write`);
  checks++;
}
await blocked("unauthenticated", { session: null }, 401);
await blocked("expired Google authorization", { session: { ...session, error: "RefreshAccessTokenError" } }, 401);
await blocked("confirmation required", {}, 400, { confirmed: false });
await blocked("browser cannot replace saved draft", {}, 400, { body: "Unreviewed content" });
await blocked("missing queue item", { missing: true });
await blocked("stale queue version", {}, 409, { version: 2 });
await blocked("blank draft", { item: { draft: "  " } });
await blocked("old draft", { item: { draft_message_id: "older" } });
await blocked("already waiting", { item: { status: "waiting" } });
await blocked("handled", { item: { status: "handled" } });
await blocked("new incoming message", { context: { messageId: "new" } });
await blocked("own sent alias", { context: { sent: true } });
await blocked("own address", { context: { from: "Owner <owner@willowed.org>" } });
await blocked("changed recipient", {}, 409, { expectedTo: "different@school.example" });
await blocked("changed subject", {}, 409, { expectedSubject: "Different subject" });
await blocked("header injection", { context: { to: "person@school.example\r\nBcc: other@school.example" } });
await blocked("queue changed during claim", { claimFails: true });
await blocked("new mail after claim", { afterClaim: { messageId: "new" } });

const preview = fixture();
const previewResponse = await preview.api.GET(get());
const previewBody = await previewResponse.json();
assert.equal(previewResponse.status, 200);
assert.equal(previewBody.to, reply.to);
assert.equal(previewBody.draft, original.draft);
assert.equal(preview.writes(), 0);
assert.equal(preview.deliveries.length, 0);
checks++;

const sent = fixture();
const sentResponse = await sent.api.POST(post());
assert.equal((await sentResponse.json()).ok, true);
assert.equal(sent.row().status, "waiting");
assert.equal(sent.row().notes, original.notes);
assert.equal(sent.row().draft, original.draft);
assert.equal(sent.deliveries.length, 1);
assert.equal(sent.deliveries[0].input.body, original.draft);
assert.equal(sent.deliveries[0].input.to, reply.to);
assert.equal(sent.deliveries[0].input.inReplyTo, reply.inReplyTo);
assert.equal(sent.deliveries[0].input.references, reply.references);
assert.equal(sent.deliveries[0].thread, "thread");
assert.equal((await sent.api.POST(post())).status, 409);
assert.equal(sent.deliveries.length, 1);
checks++;

const concurrent = fixture();
const results = await Promise.all([concurrent.api.POST(post()), concurrent.api.POST(post())]);
assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
assert.equal(concurrent.deliveries.length, 1);
checks++;

const failedQueue = fixture({ queueFails: true });
const receipt = await failedQueue.api.POST(post());
assert.equal(receipt.status, 200);
assert.match((await receipt.json()).warning, /Reply sent/);
assert.equal(failedQueue.deliveries.length, 1);
checks++;

const unknown = fixture({ sendFails: true });
const unknownResponse = await unknown.api.POST(post());
assert.equal(unknownResponse.status, 502);
assert.equal((await unknownResponse.json()).uncertain, true);
assert.equal((await unknown.api.POST(post())).status, 409);
assert.equal(unknown.deliveries.length, 1);
assert.equal(unknown.row().draft, original.draft);
checks++;

// Native Gmail metadata parsing honors Reply-To, filters drafts, and chooses
// chronological latest even when the transport gives messages out of order.
let calls = 0;
const gmail = moduleAt("src/lib/gmail.ts", { "./mail-views": {} }, {}, "", {
  Buffer,
  fetch: async (_url, options) => {
    calls++;
    if (options.method === "POST") return new Response("Transient failure", { status: 503 });
    return Response.json({ messages: [
      { id: "incoming", internalDate: "2000", payload: { headers: [{ name: "From", value: "person@school.example" }, { name: "Reply-To", value: reply.to }, { name: "Subject", value: "Help" }, { name: "Message-ID", value: reply.inReplyTo }] } },
      { id: "older", internalDate: "1000", payload: { headers: [] } },
      { id: "unsent", internalDate: "3000", labelIds: ["DRAFT"], payload: { headers: [] } },
    ] });
  },
  setTimeout() { throw new Error("Send must not automatically retry"); },
});
const actualContext = await gmail.getReplyContext("synthetic", "thread");
assert.equal(actualContext.to, reply.to);
assert.equal(actualContext.messageId, "incoming");
assert.equal(actualContext.subject, reply.subject);
await assert.rejects(() => gmail.sendEmail("synthetic", { to: reply.to, subject: reply.subject, body: "Synthetic" }, "thread"), /Gmail API 503/);
assert.equal(calls, 2, "one metadata read and exactly one send attempt");
checks++;

// Exercise the actual dialog event handlers with a minimal hook harness.
// This is not a browser layout/accessibility test.
const uiExports = {};
let stateIndex = 0;
let states = [];
const refs = [];
let refIndex = 0;
let uiPosts = 0;
let sentNotice;
let closeAttempted;
let failUi = false;
const mocks = {
  react: {
    useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = value; }]; },
    useRef(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; },
    useEffect() {},
  },
  "react/jsx-runtime": jsxRuntime,
  "lucide-react": { Loader2: () => null, Send: () => null },
  "@/lib/http": { readJsonResponse: (response) => response.json() },
};
const source = ts.transpileModule(fs.readFileSync("src/components/PartnerReplySendDialog.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(source, { exports: uiExports, require(id) { if (!(id in mocks)) throw new Error(`Unmocked UI dependency: ${id}`); return mocks[id]; },
  fetch: async (_url, options) => {
    uiPosts++;
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), confirmation);
    if (failUi) throw new Error("Synthetic network interruption");
    return Response.json({ ok: true, messageId: "sent", warning: "Reply sent. Queue will catch up." });
  },
}, { filename: "PartnerReplySendDialog.tsx" });
const render = () => { stateIndex = 0; refIndex = 0; return uiExports.default({ item: original, onSent: (notice) => { sentNotice = notice; }, onClose: (attempted) => { closeAttempted = attempted; } }); };
function buttons(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  return [...(node.type === "button" ? [node] : []), ...buttons(node.props?.children)];
}
assert.equal(buttons(render()).at(-1).props.disabled, true, "send disabled before recipient preview loads");
states[0] = { to: reply.to, subject: reply.subject, messageId: reply.messageId, version: original.version, draft: original.draft };
const loaded = buttons(render());
loaded[0].props.onClick();
assert.equal(closeAttempted, false, "back to editing never sends");
assert.equal(uiPosts, 0);
loaded.at(-1).props.onClick();
loaded.at(-1).props.onClick();
assert.equal(uiPosts, 1, "immediate repeated clicks cannot submit twice");
await new Promise((resolve) => setImmediate(resolve));
assert.match(sentNotice, /Reply sent/);
assert.equal(buttons(render()).at(-1).props.disabled, true, "no repeat send after receipt");
checks++;

states = [states[0], null, false, false];
refs.length = 0;
failUi = true;
buttons(render()).at(-1).props.onClick();
await new Promise((resolve) => setImmediate(resolve));
assert.match(states[1], /check Mail or Gmail before retrying/);
assert.equal(buttons(render()).at(-1).props.disabled, true, "uncertain delivery cannot be retried in this dialog");
buttons(render())[0].props.onClick();
assert.equal(closeAttempted, true, "return to queue after an attempted send");
checks++;
console.log(`Partner send: ${checks} offline checks passed. No real emails sent.`);
