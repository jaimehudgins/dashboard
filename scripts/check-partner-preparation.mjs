// Offline checks only; no Google, Anthropic, Slack, or database requests.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";

function load(path, mocks = {}, environment = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports, require: (id) => {
      if (id === "server-only") return {};
      if (id in mocks) return mocks[id];
      throw new Error(`Unexpected import: ${id}`);
    },
    console, Date, Intl, Error, Set, Map, Request, Response, setTimeout, clearTimeout,
    process: { env: { LEO_AUTO_DRAFTS_ENABLED: "true", LEO_ALLOWED_EMAIL: "owner@willowed.org", ...environment } },
  });
  return exports;
}
const time = load("src/lib/time-zone.ts");
const responsePolicy = load("src/lib/response-needed-policy.ts");
const policy = load("src/lib/partner-preparation-policy.ts", { "./time-zone": time, "./response-needed-policy": responsePolicy });
assert.equal(policy.preparationWindow(new Date("2026-09-08T13:00:00Z")).label, "8:00 AM");
assert.equal(policy.preparationWindow(new Date("2026-12-08T14:00:00Z")).label, "8:00 AM", "CST uses the same local window");
assert.equal(policy.preparationWindow(new Date("2026-12-08T13:59:00Z")), null);
assert.equal(policy.preparationWindow(new Date("2026-09-08T16:00:00Z")).label, "11:00 AM");
assert.equal(policy.preparationWindow(new Date("2026-09-08T19:00:00Z")).label, "2:00 PM");
assert.equal(policy.preparationWindow(new Date("2026-09-08T21:45:00Z")).label, "4:45 PM");
assert.equal(policy.preparationWindow(new Date("2026-09-12T13:00:00Z")), null, "no weekend runs");
assert.equal(policy.nextPreparationLabel(new Date("2026-09-11T23:00:00Z")), "Monday at 8:00 AM Central");
assert.equal(policy.nextPreparationLabel(new Date("2026-12-08T15:00:00Z")), "11:00 AM Central");
assert.equal(policy.preparationWindow(new Date("2026-09-08T23:00:00Z")), null, "no evening work outside the pilot window");
assert.match(policy.humanActionReason("Add Believe CC ALMA flag reviewers to staff"), /platform change/i);
assert.match(policy.humanActionReason("Please create an account for our new counselor"), /platform change/i);
assert.equal(policy.humanActionReason("Where can I find the dashboard?"), null);
assert.deepEqual(Array.from(policy.requiredReplySources("Where is the lesson curriculum?")), ["drive"]);

const example = {
  thread_id: "t", version: 1, message_id: "m", partner_id: "p", partner_name: "Example school",
  status: "needs_response", in_inbox: true, draft: "", notes: "", received_at: "2026-09-08T12:30:00Z",
  response_assessment: { message_id: "m", decision: "reply_needed", confidence: "high", reason: "Unanswered question" },
};
assert.equal(policy.canPrepareResponse(example), true);
assert.equal(policy.canPrepareResponse({ ...example, preparation_message_id: "earlier-message" }), true, "an old sent draft's preparation marker cannot block the new reply");
assert.equal(policy.canPrepareResponse({ ...example, response_assessment: { ...example.response_assessment, decision: "waiting" } }), false, "retiring a draft must not cause a needless reply");
assert.equal(policy.canPrepareResponse({ ...example, draft: "My existing text" }), false);
assert.equal(policy.canPrepareResponse({ ...example, status: "waiting" }), false);
assert.equal(policy.canPrepareResponse({ ...example, preparation_message_id: "m" }), false);
assert.equal(policy.canPrepareResponse({ ...example, partner_id: null }), false);
assert.equal(policy.canPrepareResponse({ ...example, response_assessment: null }), false, "assess response need before automatic drafting");
assert.equal(policy.canPrepareResponse({ ...example, response_correction: { message_id: "m", decision: "action_only" } }), false, "human action-only correction suppresses drafting");

function harness(options = {}) {
  const ids = options.ids ?? ["t"];
  const items = new Map(ids.map((id) => [id, { ...example, ...options.item, thread_id: id }]));
  let run = options.complete ? { status: "complete" } : null;
  let drafts = 0;
  let saved = 0;
  let metadataReads = 0;
  let synced = 0;
  const db = {
    rpc: async () => {
      if (options.busy) return { data: false, error: null };
      run ??= { batch_key: "2026-09-08:8:0", remaining_thread_ids: ids.slice(), prepared: 0, needs_input: 0, skipped: 0, failed: 0, status: "running" };
      return { data: true, error: null };
    },
    from() {
      const query = {
        old: false, patch: null,
        select() { return this; }, eq() { return this; },
        update(patch) { this.patch = patch; return this; },
        lt() { this.old = true; return this; },
        single() { return this; }, maybeSingle() { return this; },
        then(resolve) {
          if (this.patch && !this.old) Object.assign(run, this.patch);
          return Promise.resolve(resolve({ data: run ? { ...run, remaining_thread_ids: run.remaining_thread_ids?.slice() } : null, error: null }));
        },
      }; return query;
    },
  };
  const worker = load("src/lib/partner-response-preparation.ts", {
    "node:crypto": { randomUUID: () => "lease" }, zod: { z },
    "./anthropic": { isAnthropicConfigured: true, anthropic: { messages: { create: async () => ({ content: [{ type: "text", text: JSON.stringify({ decision: "draft", confidence: options.confidence ?? "high", reason: "Routine request supported by the evidence.", required_sources: options.required ?? [] }) }] }) } } },
    "./email-draft": { generateEmailDraft: async () => { drafts++; if (options.generationFailure) throw new Error("Draft service unavailable"); return { draft: options.draft ?? "Thanks for confirming. I look forward to our conversation.", sources: [] }; } },
    "./gmail": { getThread: async () => ({ id: "t", messages: [{ id: "m", from: "partner@example.org", subject: "Next steps", date: "today", body: options.body ?? "Confirming our conversation.", cleanBody: options.body ?? "Confirming our conversation." }] }) },
    "./gmail-history": {
      isOwnReply: (thread) => thread.lastMessageSent === true,
      gmailProfile: async () => ({ emailAddress: options.wrongAccount ? "other@example.org" : "owner@willowed.org" }),
      threadMetadata: async () => ({ lastMessageId: ++metadataReads > 1 && options.newMessage ? "new" : "m", lastMessageSent: options.alreadySent ?? false }),
    },
    "./partner-mail-sync": { syncPartnerMail: async () => { synced++; } },
    "./partner-response-store": {
      responseStoreConfigured: true, responseDb: () => db, getResponse: async (id) => items.get(id),
      getMailSyncState: async () => ({ last_checked_at: options.stale ? "2026-09-08T12:30:00Z" : "2026-09-08T13:00:01Z" }),
      updateResponse: async (id, version, patch) => {
        const item = items.get(id);
        if (options.conflict || item.version !== version) throw new Error("Changed in another tab");
        const updated = { ...item, ...patch, version: version + 1 }; items.set(id, updated); saved++; return updated;
      },
    },
    "./partner-preparation-policy": policy,
    "./response-needed-policy": responsePolicy,
    "./reply-sources": { gatherReplySources: async () => options.sources ?? [], sourcesForPrompt: () => "Mock evidence" },
  });
  return { run: () => worker.runPartnerPreparation("mock", new Date("2026-09-08T13:05:00Z")), item: () => items.get(ids[0]), batch: () => run, drafts: () => drafts, saved: () => saved, synced: () => synced };
}

const normal = harness();
await normal.run();
assert.equal(normal.item().status, "draft_ready");
assert.equal(normal.item().preparation_message_id, "m");
assert.equal(normal.batch().status, "complete");
await normal.run();
assert.equal(normal.drafts(), 1, "repeat worker ticks never duplicate a completed window");
const human = harness({ body: "Please add the ALMA flag reviewers to staff" });
await human.run();
assert.equal(human.item().status, "needs_input");
assert.equal(human.drafts(), 0);
const alreadySent = harness({ alreadySent: true });
await alreadySent.run();
assert.equal(alreadySent.item().status, "waiting");
assert.equal(alreadySent.drafts(), 0, "do not draft a second reply when the latest message is already sent");
assert.equal(alreadySent.batch().needs_input, 0);
const missing = harness({ body: "Where is the curriculum lesson?" });
await missing.run();
assert.equal(missing.item().status, "needs_input", "deterministic source routing cannot be bypassed by an empty model source list");
assert.equal(missing.drafts(), 0);
const uncertain = harness({ confidence: "medium" });
await uncertain.run();
assert.equal(uncertain.item().status, "needs_input");
const mismatch = harness({ sources: [{ id: "crm:other", kind: "crm", content: "Wrong school" }] });
await mismatch.run();
assert.equal(mismatch.item().status, "needs_input");
const unsafeDraft = harness({ draft: "I've added the accounts." });
await unsafeDraft.run();
assert.equal(unsafeDraft.item().status, "needs_input");
assert.equal(unsafeDraft.batch().needs_input, 1);
const savedDraft = harness({ item: { draft: "My edits" } });
await savedDraft.run();
assert.equal(savedDraft.item().draft, "My edits");
assert.equal(savedDraft.drafts(), 0);
const changing = harness({ newMessage: true });
await changing.run();
assert.equal(changing.saved(), 0, "don't save a draft after a new message arrives");
assert.equal(changing.batch().failed, 1);
const conflicting = harness({ conflict: true });
await conflicting.run();
assert.equal(conflicting.saved(), 0, "preserve concurrent human edits");
const serviceFailure = harness({ generationFailure: true });
await serviceFailure.run();
assert.equal(serviceFailure.item().preparation_message_id, undefined, "failed generation remains eligible for a later window");
assert.equal(serviceFailure.batch().lock_id, null);
const stale = harness({ stale: true });
await stale.run();
assert.equal(stale.synced(), 1);
assert.equal(stale.drafts(), 0, "wait for fresh mail before snapshotting the window");
const busy = harness({ busy: true });
await busy.run();
assert.equal(busy.drafts(), 0);
const wrong = harness({ wrongAccount: true });
await assert.rejects(() => wrong.run(), /does not match/);
const partial = harness({ ids: ["first", "second", "third"] });
await partial.run();
assert.equal(partial.drafts(), 2, "process a bounded slice per invocation");
assert.equal(partial.batch().remaining_thread_ids.length, 1);
assert.equal(partial.batch().status, "running");
await partial.run();
assert.equal(partial.drafts(), 3, "resume only the remaining snapshot");
assert.equal(partial.batch().status, "complete");
const crashRecovery = harness({ item: { draft: "Saved before the crash", status: "draft_ready", preparation_batch_key: "2026-09-08:8:0", preparation_message_id: "m" } });
await crashRecovery.run();
assert.equal(crashRecovery.drafts(), 0, "a save preceding a crash is not regenerated");
assert.equal(crashRecovery.batch().prepared, 1);
class TestResponse extends Response {
  static json(body, init) { return new Response(JSON.stringify(body), init); }
}
let cronRuns = 0;
const cronMocks = {
  "next/server": { NextResponse: TestResponse },
  "@/lib/google-auth": { getGoogleAccessToken: async () => "mock" },
  "@/lib/partner-response-preparation": { automaticPreparationEnabled: true, runPartnerPreparation: async () => { cronRuns++; return { complete: true }; } },
};
const cronPath = "src/app/api/cron/prepare-partner-responses/route.ts";
const cron = load(cronPath, cronMocks, { CRON_SECRET: "test-only" });
assert.equal((await cron.GET(new Request("https://leo.test/api/cron/prepare-partner-responses"))).status, 401);
assert.equal(cronRuns, 0);
assert.equal((await cron.GET(new Request("https://leo.test/api/cron/prepare-partner-responses", { headers: { Authorization: "Bearer test-only" } }))).status, 200);
assert.equal(cronRuns, 1);
const noSecret = load(cronPath, cronMocks);
assert.equal((await noSecret.GET(new Request("https://leo.test/api/cron/prepare-partner-responses"))).status, 401, "a missing CRON_SECRET must fail closed");
console.log("Partner preparation regression checks passed (offline, no external writes).");
