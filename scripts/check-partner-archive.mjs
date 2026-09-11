// Synthetic transports only: never archives real Gmail conversations.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { z } from "zod";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";

const email = "owner@example.org";
const original = { thread_id: "thread", message_id: "incoming", version: 3, in_inbox: true, status: "needs_input", notes: "Preserve notes", draft: "Unsent edit", follow_up_on: "2026-09-12" };
const input = { threadId: "thread", expectedMessageId: "incoming", version: 3, confirmed: true, acknowledgeFollowUp: true };
const archivePolicy = moduleAt("src/lib/partner-archive.ts");
const responseStates = moduleAt("src/types/partner-response.ts");
const request = (patch = {}) => new Request("https://leo.example/api/partner-responses/archive", { method: "POST", body: JSON.stringify({ ...input, ...patch }) });
function fixture(options = {}) {
  let row = { ...original, ...options.item }, archives = 0, updates = 0, reads = 0;
  const api = moduleAt("src/app/api/partner-responses/archive/route.ts", {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => options.session === undefined ? { user: { email }, accessToken: "synthetic" } : options.session },
    zod: { z }, "@/lib/auth": {},
    "@/lib/partner-archive": archivePolicy,
    "@/lib/gmail": { archiveThread: async (_token, id) => { assert.equal(id, "thread"); archives++; if (options.archiveFails) throw new Error("Lost receipt"); } },
    "@/lib/gmail-history": {
      gmailProfile: async () => ({ emailAddress: options.wrongAccount ? "other@example.org" : email }),
      threadMetadata: async () => { reads++; return options.missingMail ? null : { lastMessageId: options.newMessage || (reads > 1 && options.arriveAfter) ? "new" : "incoming", labelIds: options.stillInInbox ? ["INBOX"] : reads > 1 || options.alreadyArchived ? [] : ["INBOX"] }; },
    },
    "@/lib/partner-response-store": {
      getResponse: async () => options.missing ? null : { ...row },
      updateResponse: async (_id, version, patch) => {
        if (version !== row.version || options.conflict || (updates && options.bookkeepingFails)) throw new Error("Changed");
        row = { ...row, ...patch, version: row.version + 1 }; updates++; return { ...row };
      },
    },
  }, { LEO_ALLOWED_EMAIL: email });
  return { api, row: () => row, archives: () => archives };
}
for (const [options, patch, status] of [
  [{ session: null }, {}, 401],
  [{ session: { user: { email: "other@example.org" }, accessToken: "synthetic" } }, {}, 401],
  [{ session: { user: { email }, accessToken: "synthetic", error: "RefreshAccessTokenError" } }, {}, 401],
  [{}, { confirmed: false }, 400],
  [{}, { status: "handled" }, 400],
  [{}, { threadId: "../unsafe" }, 400],
  [{}, { version: 2 }, 409],
  [{}, { expectedMessageId: "old" }, 409],
  [{}, { acknowledgeFollowUp: false }, 409],
  [{ missing: true }, {}, 404],
  [{ wrongAccount: true }, {}, 403],
  [{ conflict: true }, {}, 409],
  [{ newMessage: true }, {}, 409],
  [{ missingMail: true }, {}, 409],
]) {
  const f = fixture(options);
  assert.equal((await f.api.POST(request(patch))).status, status);
  assert.equal(f.archives(), 0, "invalid/stale/unconfirmed requests cannot archive");
}
const f = fixture();
const response = await (await f.api.POST(request())).json();
assert.equal(response.ok, true);
assert.equal(f.archives(), 1);
assert.equal(f.row().in_inbox, false);
for (const key of ["draft", "notes", "follow_up_on", "message_id"]) assert.equal(f.row()[key], original[key], `${key} unchanged`);
assert.equal(f.row().status, "handled", "successful archive removes it from active Attention");
assert.equal(f.row().response_correction, undefined, "archive is not a learned no_reply correction");
assert.match(response.notice, /not deleted/);
assert.match(response.notice, /Handled recently/);
assert.equal(responseStates.responseAfterMessage(f.row(), "incoming", true, true), "handled", "label/read sync must not reopen archived Attention");
assert.equal(responseStates.responseAfterMessage(f.row(), "new-incoming", true, true), "needs_response", "new partner mail reopens archived Attention");
assert.equal(responseStates.responseAfterMessage(f.row(), "new-incoming", true, false), "needs_input", "unmatched incoming mail still reopens");
assert.equal(responseStates.responseAfterMessage(f.row(), "new-outgoing", false, true), "handled", "own additional replies do not reopen");
assert.equal((await f.api.POST(request())).status, 409);
assert.equal(f.archives(), 1, "duplicate reviewed version cannot archive twice");
const concurrent = fixture();
const results = await Promise.all([concurrent.api.POST(request()), concurrent.api.POST(request())]);
assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
assert.equal(concurrent.archives(), 1);
for (const options of [{ bookkeepingFails: true }, { arriveAfter: true }]) {
  const f = fixture(options);
  const response = await (await f.api.POST(request())).json();
  assert.equal(response.ok, true);
  assert.equal(response.item, null);
  assert.match(response.notice, /newer activity or a queue update/);
  assert.equal(f.archives(), 1);
  assert.equal(f.row().draft, original.draft);
  assert.equal(f.row().status, original.status, "races and partial failures must not hide the conversation");
}
const uncertain = fixture({ archiveFails: true });
assert.equal((await uncertain.api.POST(request())).status, 502);
assert.equal(uncertain.archives(), 1);
assert.equal(uncertain.row().in_inbox, true);
assert.equal(uncertain.row().status, original.status);
assert.equal((await uncertain.api.POST(request())).status, 409);
const already = fixture({ alreadyArchived: true });
assert.equal((await already.api.POST(request())).status, 200);
assert.equal(already.archives(), 0);
assert.equal(already.row().in_inbox, false);
assert.equal(already.row().status, "handled", "Gmail-only archived conversations can be removed from Attention too");
const stillInInbox = fixture({ stillInInbox: true });
assert.equal((await stillInInbox.api.POST(request())).status, 200);
assert.equal(stillInInbox.row().status, original.status, "do not hide a thread still in the inbox");
assert.match(archivePolicy.archiveConfirmation(original), /follow-up is scheduled/);
assert.match(archivePolicy.archiveConfirmation({ ...original, status: "waiting" }), /waiting for a partner answer/);
assert.match(archivePolicy.archiveConfirmation({ ...original, status: "draft_ready" }), /does not send the draft/);
assert.match(archivePolicy.archiveConfirmation({ ...original, response_correction: { message_id: "incoming", decision: "action_only" } }), /unfinished work/);

// Exercise the row control without a browser or real Gmail writes.
function rowControl(options = {}) {
  const states = [], requests = [], notices = [];
  let cursor = 0, refreshes = 0;
  const exports = {};
  const mocks = {
    react: {
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = value; }]; },
      useRef(initial) { const i = cursor++; if (!(i in states)) states[i] = { current: initial }; return states[i]; },
    },
    "react/jsx-runtime": jsx,
    "lucide-react": { Archive: () => null, Loader2: () => null },
    "@/lib/http": { readJsonResponse: async (response) => response.json() },
    "@/lib/partner-archive": archivePolicy,
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/components/PartnerResponseRowArchive.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, require(id) { if (id in mocks) return mocks[id]; throw new Error(`Unmocked dependency ${id}`); },
    window: { confirm: () => options.confirm !== false },
    fetch: async (url, init) => {
      requests.push({ url, ...JSON.parse(init.body) });
      if (options.networkError) throw new Error("Network lost");
      return Response.json(options.body ?? { ok: true, notice: "Archived; follow-up unchanged." }, { status: options.status ?? 200 });
    },
  });
  const render = () => { cursor = 0; return exports.default({ item: { ...original, subject: "Planning", ...options.item }, onArchived: (notice) => notices.push(notice), onRefresh: async () => { refreshes++; } }); };
  const buttons = (tree) => {
    if (!tree || typeof tree !== "object") return [];
    if (Array.isArray(tree)) return tree.flatMap(buttons);
    return [...(tree.type === "button" ? [tree] : []), ...buttons(tree.props?.children)];
  };
  const text = (tree) => {
    if (tree == null || typeof tree === "boolean") return "";
    if (typeof tree !== "object") return String(tree);
    return Array.isArray(tree) ? tree.map(text).join(" ") : text(tree.props?.children);
  };
  return { render, buttons, text, requests, notices, refreshes: () => refreshes };
}
const canceledRow = rowControl({ confirm: false });
await canceledRow.buttons(canceledRow.render())[0].props.onClick();
assert.equal(canceledRow.requests.length, 0);
const archivedRow = rowControl({ item: { in_inbox: false } });
assert.equal(archivedRow.buttons(archivedRow.render())[0].props.disabled, false, "Gmail-only archives can still be dismissed from Attention");
const handledRow = rowControl({ item: { in_inbox: false, status: "handled" } });
assert.equal(handledRow.buttons(handledRow.render())[0].props.disabled, true);
assert.match(handledRow.text(handledRow.render()), /Archived/);
const row = rowControl();
const archiveButton = row.buttons(row.render())[0];
assert.match(archiveButton.props["aria-label"], /Archive Planning from Gmail and Attention/);
archiveButton.props.onClick(); archiveButton.props.onClick();
assert.equal(row.requests.length, 1, "rapid double-click submits once");
assert.equal(row.buttons(row.render())[0].props.disabled, true);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(row.notices.length, 1);
assert.deepEqual(row.requests[0], { url: "/api/partner-responses/archive", ...input });
for (const options of [{ networkError: true }, { status: 409, body: { error: "New message" } }, { status: 502, body: { error: "Outcome unknown", uncertain: true } }]) {
  const failedRow = rowControl(options);
  failedRow.buttons(failedRow.render())[0].props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(failedRow.requests.length, 1);
  assert.equal(failedRow.notices.length, 0);
  assert.match(failedRow.text(failedRow.render()), /No automatic retry/);
  await failedRow.buttons(failedRow.render())[1].props.onClick();
  assert.equal(failedRow.refreshes(), 1);
  assert.equal(failedRow.requests.length, 1, "refresh never retries the archive");
}
const queueSource = fs.readFileSync("src/components/PartnerResponseQueue.tsx", "utf8");
assert.match(queueSource, /<\/button>\s*<PartnerResponseRowArchive/, "archive is a sibling control, not nested inside the open-conversation button");
console.log("Attention archive checks passed: confirmation, auth, stale-message/version guards, duplicate protection, saved-work preservation, and failure handling. No real email archived.");
