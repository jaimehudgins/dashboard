// Offline policy/worker checks: no live email, model calls, SQL, or external writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";

function load(path, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (id) => {
    if (id === "server-only") return {};
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected import ${id}`);
  }, Date, Error, Set, JSON, setTimeout, clearTimeout, process: { env: { LEO_ALLOWED_EMAIL: "owner@willowed.org" } } });
  return exports;
}
const policy = load("src/lib/response-needed-policy.ts");
const item = { thread_id: "abc123", message_id: "m2", partner_id: "partner", partner_name: "School", status: "needs_response", version: 1, notes: "Check the earlier question", draft: "Saved draft" };
assert.equal(policy.correctedResponseStatus("no_reply"), "handled");
assert.equal(policy.correctedResponseStatus("action_only"), "needs_input");
assert.equal(policy.correctedResponseStatus("waiting"), "waiting");
assert.equal(policy.assessedResponseStatus(item, { decision: "no_reply", confidence: "high" }), "needs_input", "AI cannot close a conversation");
assert.equal(policy.assessedResponseStatus({ ...item, status: "handled" }, { decision: "reply_needed", confidence: "high" }), "handled");
assert.equal(policy.effectiveResponseNeed({ ...item, response_assessment: { message_id: "m2", decision: "reply_needed" }, response_correction: { message_id: "m2", decision: "action_only" } }), "action_only", "current human correction takes precedence");
assert.equal(policy.effectiveResponseNeed({ ...item, response_correction: { message_id: "m1", decision: "no_reply" } }), null, "a new email invalidates the old decision");

function harness(options = {}) {
  const writes = [];
  const requests = [];
  const stateWrites = [];
  let calls = 0;
  let taskQueries = 0;
  const db = {
    rpc: async (name) => ({ data: name === "claim_partner_policy" ? !options.busy : options.pending ?? [item], error: null }),
    from(table) {
      const query = {
        patch: null,
        select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, single() { return this; },
        or(filter) { taskQueries++; assert.match(filter, /abc123/); return this; },
        update(patch) { this.patch = patch; return this; },
        then(resolve) {
          if (this.patch) stateWrites.push(this.patch);
          return Promise.resolve(resolve({ data: table === "partner_policy_state" ? {} : table === "tasks" ? [{ title: "Add ALMA reviewers", status: "pending" }] : [{ subject: "Staff names", correction: { decision: "action_only", reason: "I must add them" } }],
            error: options.missingSetup && table === "partner_policy_state" ? { code: "42P01" } : options.taskFailure && table === "tasks" ? { message: "Unavailable" } : null }));
        },
      }; return query;
    },
  };
  const service = load("src/lib/partner-response-policy.ts", {
    "node:crypto": { randomUUID: () => "lock" }, zod: { z }, "./response-needed-policy": policy,
    "./anthropic": { isAnthropicConfigured: true, anthropic: { messages: { create: async (request) => {
      calls++; requests.push(request);
      if (options.modelFailure) throw new Error("Unavailable");
      return { content: [{ type: "text", text: options.invalid ? "{}" : JSON.stringify({ decision: options.decision ?? "action_only", confidence: "high", reason: "Reviewer names unlock an unfinished platform task; no answer was requested." }) }] };
    } } } },
    "./gmail": { getThread: async () => ({ messages: [
      { id: "m1", from: "owner@willowed.org", subject: "Staff", body: options.long ? "x".repeat(20_000) : "I will add the staff once you send their names." },
      { id: options.changedBefore ? "new" : "m2", from: "partner@example.org", subject: "Staff", body: "Our ALMA reviewers are Alex and Sam. Thanks!" },
    ] }) },
    "./gmail-history": { gmailProfile: async () => ({ emailAddress: options.wrongAccount ? "other@example.org" : "owner@willowed.org" }), threadMetadata: async () => ({ lastMessageId: options.changedAfter ? "new" : "m2" }) },
    "./partner-response-store": { responseDb: () => db, updateResponse: async (_id, version, patch) => {
      if (options.conflict || version !== 1) throw new Error("Changed in another tab");
      writes.push(patch); return { ...item, ...patch };
    } },
  });
  return { service, writes, requests, stateWrites, calls: () => calls, taskQueries: () => taskQueries };
}

let h = harness();
await h.service.assessResponse("mock", item);
assert.equal(h.writes[0].status, "needs_input");
assert.equal(h.writes[0].response_assessment.decision, "action_only");
assert.equal("draft" in h.writes[0], false, "assessment cannot replace drafts");
assert.equal("follow_up_on" in h.writes[0], false);
assert.match(h.requests[0].system, /NEVER automatic closure/);
assert.match(h.requests[0].system, /"I'll do that" is not "That is done"/);
assert.match(h.requests[0].messages[0].content, /I will add the staff/);
assert.match(h.requests[0].messages[0].content, /Alex and Sam/);
assert.match(h.requests[0].messages[0].content, /pending/);
assert.match(h.requests[0].messages[0].content, /prior_partner_corrections/);
for (const option of ["modelFailure", "invalid", "wrongAccount", "changedBefore", "changedAfter", "conflict"]) {
  h = harness({ [option]: true });
  await assert.rejects(() => h.service.assessResponse("mock", item));
  assert.equal(h.writes.length, 0, `${option} cannot persist a decision`);
}
for (const option of ["long", "taskFailure"]) {
  h = harness({ [option]: true });
  await h.service.assessResponse("mock", item);
  assert.equal(h.writes[0].response_assessment.decision, "judgment");
  assert.equal(h.calls(), 0, "incomplete context cannot silently become closure");
}
h = harness({ decision: "no_reply" });
await h.service.assessResponse("mock", item);
assert.equal(h.writes[0].status, "needs_input");
h = harness({ pending: [item, item, item] });
await h.service.assessPendingResponses("mock");
assert.equal(h.calls(), 2, "bound each worker to two conversations");
assert.equal(h.stateWrites.at(-1).lock_id, null, "release the worker lease");
h = harness({ busy: true });
await h.service.assessPendingResponses("mock");
assert.equal(h.calls(), 0);
h = harness({ missingSetup: true });
assert.equal((await h.service.responsePolicyStatus()).ready, false);
await h.service.assessPendingResponses("mock");
assert.equal(h.calls(), 0);
h = harness({ modelFailure: true });
await h.service.assessPendingResponses("mock");
assert.match(h.stateWrites.at(-1).last_error, /Unavailable/);

const crons = JSON.parse(fs.readFileSync("vercel.json", "utf8")).crons;
assert.equal(crons.find((c) => c.path === "/api/cron/classify-mail").schedule, "*/5 * * * *");
assert.equal(crons.find((c) => c.path === "/api/cron/prepare-partner-responses").schedule, "*/5 13-23 * * 1-5");
assert.equal(crons.find((c) => c.path === "/api/cron/granola-sync").schedule, "*/15 * * * *");
const sql = fs.readFileSync("partner-response-policy.sql", "utf8");
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /FROM PUBLIC, anon, authenticated/);
assert.match(sql, /response_correction->>'message_id'/);
assert.match(sql, /AFTER UPDATE ON public.partner_responses/);
console.log("Response-needed policy checks passed (offline, no external writes).");
