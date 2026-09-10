// Offline only: real lane logic/API, synthetic rows, no network or writes.
// Run: node scripts/check-response-lanes.mjs
import assert from "node:assert/strict";
import { z } from "zod";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";

const lane = moduleAt("src/lib/partner-response-lane.ts");
const assessment = (decision = "action_only", confidence = "high", message_id = "m") => ({ decision, confidence, message_id });
const row = (id, extra = {}) => ({ thread_id: id, message_id: "m", status: "needs_input", received_at: "2026-09-09T12:00:00Z", ...extra });
const action = row("action", { response_assessment: assessment() });
assert.equal(lane.isActionNeeded(action), true);
for (const confidence of ["medium", "low"]) assert.equal(lane.isActionNeeded({ ...action, response_assessment: assessment("action_only", confidence) }), false);
for (const status of ["waiting", "handled", "needs_response", "draft_ready"]) assert.equal(lane.isActionNeeded({ ...action, status }), false);
assert.equal(lane.isActionNeeded(row("unknown")), false);
assert.equal(lane.isActionNeeded({ ...action, message_id: "new-message" }), false, "stale assessments cannot classify new email");
for (const decision of ["reply_needed", "judgment", "waiting", "no_reply"]) {
  assert.equal(lane.isActionNeeded({ ...action, response_correction: assessment(decision) }), false, "current human decision wins");
}
assert.equal(lane.isActionNeeded(row("human", { response_correction: assessment(), response_assessment: assessment("reply_needed") })), true);
assert.equal(lane.isActionNeeded({ ...action, response_correction: assessment("judgment", "high", "old") }), true, "old correction does not override current assessment");
assert.equal(lane.isActionNeeded(row("old-human", { response_correction: assessment("action_only", "high", "old") })), false);

let rows = [
  ...Array.from({ length: 65 }, (_, i) => row(`action-${String(i).padStart(3, "0")}`, { response_assessment: assessment(), received_at: i === 0 ? null : "2026-09-08T12:00:00Z" })),
  ...Array.from({ length: 70 }, (_, i) => row(`input-${String(i).padStart(3, "0")}`)),
  row("human-action", { response_correction: assessment(), response_assessment: assessment("judgment") }),
  row("human-judgment", { response_correction: assessment("judgment"), response_assessment: assessment() }),
  row("uncertain", { response_assessment: assessment("action_only", "low") }),
  row("stale", { response_assessment: assessment("action_only", "high", "old") }),
  row("handled", { status: "handled", response_assessment: assessment() }),
  row("waiting", { status: "waiting" }),
  row("critical-action", { urgency: "now", response_assessment: assessment() }),
];
let failure = false;
let policyReady = true;
let session = { user: { email: "owner@willowed.org" } };
let indexReads = 0;
const store = {
  responseStoreConfigured: true,
  storeError(error) { throw new Error(error.message); },
  getMailSyncState: async () => ({ last_checked_at: "2026-09-09T12:00:00Z" }),
  responseDb: () => ({ from(table) {
    assert.equal(table, "partner_responses");
    const predicates = [], orders = [];
    let start = 0, end = Infinity, projection = "*", head = false;
    return {
      select(fields, options = {}) { projection = fields; head = options.head; return this; },
      eq(key, value) { predicates.push((r) => r[key] === value); return this; },
      neq(key, value) { predicates.push((r) => r[key] !== value); return this; },
      gt(key, value) { predicates.push((r) => r[key] > value); return this; },
      in(key, values) { predicates.push((r) => values.includes(r[key])); return this; },
      order(key, options = {}) { orders.push([key, options]); return this; },
      limit(count) { end = count; return this; },
      range(from, to) { start = from; end = to + 1; return this; },
      async then(resolve, reject) {
        try {
          if (projection.includes("response_assessment")) {
            indexReads++;
            assert.doesNotMatch(projection, /draft|snippet|notes/, "index fetches routing metadata only");
            // Simulate a row cap lower than the requested 500.
            end = Math.min(end, 37);
            if (failure) return resolve({ error: { message: "Synthetic index read failed" } });
          }
          const selected = rows.filter((r) => predicates.every((p) => p(r))).sort((a, b) => {
            for (const [key, options] of orders) {
              if (a[key] === b[key]) continue;
              if (a[key] === null) return options.nullsFirst === false ? 1 : -1;
              if (b[key] === null) return options.nullsFirst === false ? -1 : 1;
              return (a[key] < b[key] ? -1 : 1) * (options.ascending === false ? -1 : 1);
            }
            return 0;
          });
          return resolve({ data: head ? null : selected.slice(start, end), count: selected.length, error: null });
        } catch (error) { return reject(error); }
      },
    };
  } }),
};
const index = moduleAt("src/lib/partner-response-lane-store.ts", { "./partner-response-store": store, "./partner-response-lane": lane });
const api = moduleAt("src/app/api/partner-responses/route.ts", {
  "next-auth": { getServerSession: async () => session },
  "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
  zod: { z }, "@/lib/auth": {}, "@/lib/email-draft": {}, "@/lib/gmail": {},
  "@/lib/gmail-history": {}, "@/lib/partner-mail-sync": {}, "@/lib/partner-reply-status": {},
  "@/lib/response-needed-policy": {}, "@/lib/partner-response-store": store,
  "@/lib/partner-response-policy": { responsePolicyStatus: async () => ({ ready: policyReady }) },
  "@/lib/partner-response-lane-store": index,
}, { LEO_ALLOWED_EMAIL: "owner@willowed.org" });
async function get(name, page = 0) {
  const response = await api.GET(new Request(`https://leo.example/api/partner-responses?lane=${name}&page=${page}`));
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
const first = await get("action_needed");
assert.equal(first.items.length, 50);
assert.equal(first.hasMore, true);
assert.equal(first.laneCounts.action_needed, 67);
assert.equal(first.laneCounts.needs_input, 73);
assert.equal(first.counts.needs_input, 140, "bulk scope counts include actions exactly once");
assert.ok(indexReads > 3, "all index pages read even under a lower server cap");
const second = await get("action_needed", 1);
assert.equal(second.items.length, 17);
assert.equal(second.hasMore, false);
assert.equal(second.items.at(-1).thread_id, "action-000", "null dates last");
assert.equal(new Set([...first.items, ...second.items].map((r) => r.thread_id)).size, 67);
assert.ok([...first.items, ...second.items].every(lane.isActionNeeded));
const input = [...(await get("needs_input")).items, ...(await get("needs_input", 1)).items];
assert.equal(input.length, 73);
assert.ok(input.every((r) => !lane.isActionNeeded(r)));
assert.ok(input.some((r) => r.thread_id === "human-judgment"));
assert.equal((await get("action_needed", 20)).items.length, 0);
const all = [...(await get("all")).items, ...(await get("all", 1)).items, ...(await get("all", 2)).items];
assert.equal(all.length, 141);
assert.ok(all.some(lane.isActionNeeded), "All open keeps action items");
assert.equal((await get("critical")).items[0].thread_id, "critical-action", "critical actions remain urgent");
assert.equal((await get("handled")).items[0].thread_id, "handled");
policyReady = false;
const reads = indexReads;
assert.equal((await get("action_needed")).items.length, 0);
assert.equal((await get("needs_input")).laneCounts.needs_input, 140);
assert.equal(indexReads, reads, "missing policy migration must not break saved replies");
policyReady = true;
failure = true;
assert.equal((await api.GET(new Request("https://leo.example/api/partner-responses"))).status, 500, "index errors cannot silently claim an empty queue");
failure = false;
session = null;
assert.equal((await api.GET(new Request("https://leo.example/api/partner-responses"))).status, 401);
session = { user: { email: "owner@willowed.org" } };
assert.equal((await api.PATCH(new Request("https://leo.example/api/partner-responses", { method: "PATCH", body: JSON.stringify({ threadId: "test", version: 1, status: "action_needed" }) }))).status, 400, "derived lane is not a writable status");
rows = [];
assert.equal((await get("action_needed")).laneCounts.action_needed, 0);
console.log("Response lanes: policy precedence, pagination, counts, legacy setup, API safeguards passed.");
