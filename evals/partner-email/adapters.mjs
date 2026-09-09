// Executes a frozen copy of the current production functions against fake
// Gmail/DB/source services. The ONLY live service can be the supplied model.
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { CANDIDATE_PROMPT, OUTPUT_JSON_SCHEMA } from "./prompts.mjs";

export const PRODUCTION_FILES = [
  "src/lib/response-needed-policy.ts", "src/lib/partner-response-policy.ts",
  "src/lib/partner-response-preparation.ts", "src/lib/partner-preparation-policy.ts",
  "src/lib/email-draft.ts", "src/lib/reply-sources.ts", "src/lib/time-zone.ts",
];
export const PROFILES = ["current", "candidate", "no-sources", "no-tasks", "latest-only"];

export function textResponse(response) {
  if (response.stop_reason === "max_tokens") throw new Error("Model output truncated");
  return response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
}

export async function evaluateCandidate(input, profile, call) {
  const context = structuredClone(input);
  if (profile === "no-sources") context.sources = [];
  if (profile === "no-tasks") context.tasks = [];
  if (profile === "latest-only") context.thread.messages = context.thread.messages.slice(-1);
  const response = await call({ max_tokens: 2200, system: CANDIDATE_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(context) }],
    output_config: { format: { type: "json_schema", schema: OUTPUT_JSON_SCHEMA } },
  }, "candidate");
  return { outcome: JSON.parse(textResponse(response)), trace: { adapter: profile, actionPlanSupported: true, claimLedgerSupported: true, sourcesAvailable: context.sources.map((s) => s.id), messageCount: context.thread.messages.length } };
}

export async function evaluateCurrent(input, snapshot, call) {
  const calls = [];
  function load(path, mocks, suffix = "") {
    const exports = {};
    if (!(path in snapshot)) throw new Error(`Missing frozen production file ${path}`);
    const code = ts.transpileModule(snapshot[path] + suffix, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, require: (id) => {
      if (id === "server-only") return {};
      if (id in mocks) return mocks[id];
      throw new Error(`Unmocked dependency blocked: ${id}`);
    }, Date, Intl, Set, Map, Error, JSON, setTimeout, clearTimeout,
    console: { warn() {}, error() {}, log() {} },
    process: { env: { LEO_ALLOWED_EMAIL: "jaime@willow.example", LEO_AUTO_DRAFTS_ENABLED: "true" } },
    });
    return exports;
  }
  const anthropic = { isAnthropicConfigured: true, anthropic: { messages: { create: async (request) => {
    calls.push(request.system);
    return call(request, "current");
  } } } };
  const latest = input.thread.messages.at(-1);
  const crmId = input.sources.find((s) => s.id.startsWith("crm:"))?.id.slice(4);
  let item = { thread_id: input.thread.id, message_id: latest.id, version: 1, partner_id: input.partner ? crmId ?? "eval-partner" : null,
    partner_name: input.partner ?? "Unmatched organizer", status: "needs_response", in_inbox: true, draft: "", notes: input.notes };
  const gmail = { getThread: async () => input.thread, getSentSamples: async () => input.voiceSamples };
  const gmailHistory = { gmailProfile: async () => ({ emailAddress: "jaime@willow.example" }), threadMetadata: async () => ({ lastMessageId: latest.id, from: latest.from, lastMessageSent: false }), isOwnReply: () => false };
  const db = { from(table) {
    const query = { select() { return this; }, or() { return this; }, eq() { return this; }, is() { return this; }, order() { return this; }, limit() { return this; },
      then(resolve) { return Promise.resolve(resolve({ data: table === "tasks" ? input.tasks : [], error: null })); } };
    return query;
  } };
  const store = { responseDb: () => db, updateResponse: async (_id, version, patch) => {
    if (version !== item.version) throw new Error("Eval version conflict");
    item = { ...item, ...patch, version: version + 1 }; return item;
  } };
  const policy = load("src/lib/response-needed-policy.ts", {});
  const assessment = load("src/lib/partner-response-policy.ts", { "node:crypto": { randomUUID: () => "eval" }, zod: { z }, "./anthropic": anthropic,
    "./gmail": gmail, "./gmail-history": gmailHistory, "./partner-response-store": store, "./response-needed-policy": policy });
  await assessment.assessResponse("synthetic-not-a-token", item);
  const decision = item.response_assessment.decision;
  const reason = item.response_assessment.reason;
  const prepPolicy = load("src/lib/partner-preparation-policy.ts", { "./time-zone": load("src/lib/time-zone.ts", {}), "./response-needed-policy": policy });
  let prepared = {};
  if (prepPolicy.canPrepareResponse(item)) {
    const sourceFunctions = load("src/lib/reply-sources.ts", { "./drive": {}, "./partner-context": {}, "./platform-knowledge": {} });
    const sources = { ...sourceFunctions, gatherReplySources: async () => input.sources };
    const drafts = load("src/lib/email-draft.ts", { "./anthropic": anthropic, "./gmail": gmail, "./reply-sources": sources });
    const prep = load("src/lib/partner-response-preparation.ts", { "node:crypto": { randomUUID: () => "eval" }, zod: { z }, "./anthropic": anthropic,
      "./email-draft": drafts, "./gmail": gmail, "./gmail-history": gmailHistory, "./partner-mail-sync": {},
      "./partner-response-store": store, "./partner-preparation-policy": prepPolicy, "./reply-sources": sources, "./response-needed-policy": policy }, "\nexport { prepareItem };\n");
    prepared = await prep.prepareItem("synthetic-not-a-token", item);
  }
  return {
    outcome: { decision, mode: prepared.draft ? prepared.status === "draft_ready" ? "draft" : "hold" : ["no_reply", "action_only", "waiting"].includes(decision) ? "none" : "hold",
      reason: [reason, prepared.preparation_reason].filter(Boolean).join(" "), draft: prepared.draft ?? "",
      actions: [], sources_used: (prepared.draft_sources ?? []).map((source) => source.id), claims: [], performed_actions: [] },
    trace: { adapter: "current", queueStatus: prepared.status ?? item.status, modelCalls: calls.length, actionPlanSupported: false, claimLedgerSupported: false,
      unsupportedPartnerQueueScope: !input.partner, retrieval: "fixed fixture sources; live retrieval NOT tested" },
  };
}
