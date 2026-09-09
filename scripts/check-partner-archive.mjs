// Synthetic transports only: never archives real Gmail conversations.
import assert from "node:assert/strict";
import { z } from "zod";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";

const email = "owner@example.org";
const original = { thread_id: "thread", message_id: "incoming", version: 3, in_inbox: true, status: "needs_input", notes: "Preserve notes", draft: "Unsent edit", follow_up_on: "2026-09-12" };
const input = { threadId: "thread", expectedMessageId: "incoming", version: 3, confirmed: true };
const request = (patch = {}) => new Request("https://leo.example/api/partner-responses/archive", { method: "POST", body: JSON.stringify({ ...input, ...patch }) });
function fixture(options = {}) {
  let row = { ...original }, archives = 0, updates = 0, reads = 0;
  const api = moduleAt("src/app/api/partner-responses/archive/route.ts", {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => options.session === undefined ? { user: { email }, accessToken: "synthetic" } : options.session },
    zod: { z }, "@/lib/auth": {},
    "@/lib/gmail": { archiveThread: async (_token, id) => { assert.equal(id, "thread"); archives++; if (options.archiveFails) throw new Error("Lost receipt"); } },
    "@/lib/gmail-history": {
      gmailProfile: async () => ({ emailAddress: options.wrongAccount ? "other@example.org" : email }),
      threadMetadata: async () => { reads++; return options.missingMail ? null : { lastMessageId: options.newMessage || (reads > 1 && options.arriveAfter) ? "new" : "incoming", labelIds: reads > 1 || options.alreadyArchived ? [] : ["INBOX"] }; },
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
for (const key of ["draft", "status", "notes", "follow_up_on", "message_id"]) assert.equal(f.row()[key], original[key], `${key} unchanged`);
assert.match(response.notice, /not deleted/);
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
}
const uncertain = fixture({ archiveFails: true });
assert.equal((await uncertain.api.POST(request())).status, 502);
assert.equal(uncertain.archives(), 1);
assert.equal(uncertain.row().in_inbox, true);
assert.equal((await uncertain.api.POST(request())).status, 409);
const already = fixture({ alreadyArchived: true });
assert.equal((await already.api.POST(request())).status, 200);
assert.equal(already.archives(), 0);
assert.equal(already.row().in_inbox, false);
console.log("Attention archive checks passed: confirmation, auth, stale-message/version guards, duplicate protection, saved-work preservation, and failure handling. No real email archived.");
