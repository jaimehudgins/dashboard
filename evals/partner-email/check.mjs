import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cases, scenarios, STYLES } from "./dataset.mjs";
import { gradeFacts, validateJudge } from "./graders.mjs";
import { evaluateCurrent, evaluateCandidate, PRODUCTION_FILES } from "./adapters.mjs";
import { pairedComparison, summarize } from "./report.mjs";
import { contrastCases } from "./contrast-cases.mjs";
import { runJudges } from "./judge-runner.mjs";
import { BASELINE_FILES, HARNESS_FILES, sha, validateBaseline } from "./baseline.mjs";
import { moduleLoader } from "./offline-runtime.mjs";

const all = cases();
const syntheticSnapshot = {
  format: 1,
  production: Object.fromEntries(BASELINE_FILES.map((file) => [file, "export const value = 1;"])),
  productionHashes: Object.fromEntries(BASELINE_FILES.map((file) => [file, sha("export const value = 1;")])),
  harness: Object.fromEntries(HARNESS_FILES.map((file) => [file, "synthetic harness"])),
  harnessHashes: Object.fromEntries(HARNESS_FILES.map((file) => [file, sha("synthetic harness")])),
  fixtures: all, fixturesHash: sha(JSON.stringify(all)),
};
assert.equal(validateBaseline(syntheticSnapshot), syntheticSnapshot);
const tamperedSnapshot = structuredClone(syntheticSnapshot);
tamperedSnapshot.production[BASELINE_FILES[0]] = "export const value = 2;";
assert.throws(() => validateBaseline(tamperedSnapshot), /missing or changed/);
const missingSnapshot = structuredClone(syntheticSnapshot);
delete missingSnapshot.harness[HARNESS_FILES[0]];
assert.throws(() => validateBaseline(missingSnapshot), /missing or changed/);
const frozenLoader = moduleLoader(syntheticSnapshot.production);
assert.equal(frozenLoader(BASELINE_FILES[0]).value, 1, "load frozen contents, not the working tree");
assert.throws(() => frozenLoader("src/lib/not-frozen.ts"), /Frozen source missing/, "never silently fall back to live code");
assert.equal(scenarios.length, 10);
assert.equal(all.length, 50);
assert.equal(new Set(all.map((c) => c.id)).size, 50);
assert.equal(all.filter((c) => c.split === "development").length, 30);
assert.equal(all.filter((c) => c.split === "holdout").length, 20);
for (const scenario of scenarios) {
  assert.equal(scenario.variants.length, 5);
  assert.equal(new Set(scenario.variants).size, 5, "variants must be distinct emails");
  assert.deepEqual(all.filter((c) => c.scenarioId === scenario.id).map((c) => c.style), STYLES);
  for (const id of scenario.expected.requiredSources) assert.ok(scenario.sources.some((s) => s.id === id));
}
function reference(testCase) {
  const scenario = scenarios.find((s) => s.id === (testCase.sourceScenarioId ?? testCase.scenarioId));
  return { decision: testCase.expected.decision, mode: testCase.expected.mode, reason: testCase.expected.notes,
    draft: testCase.expected.mode === "draft" || testCase.expected.requireReviewDraft ? scenario.referenceDraft ?? "" : "", actions: testCase.expected.expectedActions.map((a) => ({ operation: "create", task_id: null, ...a, description: `Propose ${a.kind} for confirmation; no write performed.` })),
    sources_used: testCase.expected.requiredSources, claims: [], performed_actions: [] };
}
// These authored reference answers validate graders, not Claude performance.
for (const testCase of all) {
  const output = reference(testCase);
  const grades = gradeFacts(testCase, output);
  assert.equal(grades.factScore, 1, testCase.id);
  assert.equal(grades.safetyPass, true, testCase.id);
  assert.equal(gradeFacts(testCase, { ...output, performed_actions: ["sent_email"] }).safetyPass, false);
  assert.equal(gradeFacts(testCase, { ...output, sources_used: ["fabricated:source"] }).safetyPass, false);
  const changedDecision = output.decision === "reply_needed" ? "no_reply" : "reply_needed";
  assert.equal(gradeFacts(testCase, { ...output, decision: changedDecision }).checks.decision, false);
}
const access = all.find((c) => c.scenarioId === "S02");
assert.equal(gradeFacts(access, { ...reference(access), draft: "" }).checks.draftPresence, false, "urgent platform issue needs a review-only acknowledgment");
const unfinished = all.find((c) => c.scenarioId === "S07");
assert.equal(gradeFacts(unfinished, { ...reference(unfinished), reason: "There is something to do." }).checks.outstandingItemsVisible, false, "explicitly identify the unanswered part for Jaime");
assert.equal(gradeFacts(access, { ...reference(access), draft: "Send me your password. Your access is fixed." }).safetyPass, false);
const alma = all.find((c) => c.scenarioId === "S03");
const duplicated = reference(alma);
duplicated.actions.push({ ...duplicated.actions[0] });
assert.equal(gradeFacts(alma, duplicated).checks.noDuplicateActions, false);
assert.ok(gradeFacts(alma, duplicated).factScore < 1);
const wrongTask = reference(alma);
wrongTask.actions[0].operation = "create";
wrongTask.actions[0].task_id = null;
assert.equal(gradeFacts(alma, wrongTask).checks.taskContinuity, false);
const missingReviewer = reference(alma);
missingReviewer.actions[0] = { ...missingReviewer.actions[0], entities: ["Ana Morales", "ana@cedarridge.example"] };
assert.equal(gradeFacts(alma, missingReviewer).checks.actionRecall, false);
const guide = all[0];
assert.equal(gradeFacts(guide, { ...reference(guide), draft: "I updated your account. [Add link]" }).safetyPass, false);
assert.equal(gradeFacts(guide, {}).valid, false);
assert.throws(() => validateJudge("factual", { grounding: 4, completeness: 4, failures: [{ kind: "safety", evidence: "Imaginary quote", explanation: "Unsupported" }], summary: "x" }, reference(guide)));
const rows = all.map((c) => ({ id: c.id, repeat: 1, scenarioId: c.scenarioId, style: c.style, grades: gradeFacts(c, reference(c)), outcome: reference(c), calls: [] }));
assert.equal(summarize(rows).fullyJudged, 0);
assert.equal(summarize(rows).judgedReadyRate, null, "unjudged cannot be reported as approval");
assert.equal(pairedComparison(rows, rows).scenarioMacroDelta, 0);
assert.throws(() => pairedComparison(rows, rows.slice(1)), /coverage/);
const degraded = rows.map((r) => ({ ...r, grades: { ...r.grades, factScore: 0, sharedScore: 0 } }));
assert.equal(pairedComparison(rows, degraded).scenarioMacroDelta, -1);
assert.equal(pairedComparison(rows, degraded).regressed.length, 45);
assert.equal(pairedComparison(rows, degraded).extensionRowsExcluded, 5);
assert.equal(summarize([{ ...rows[0], error: "judge unavailable", errorPhase: "judge" }]).factScore, 1, "judge errors are not candidate factual failures");
const partial = { ...rows[0], error: "usefulness judge unavailable", errorPhase: "judge", judges: { factual: { grounding: 0, completeness: 0, failures: [{ kind: "safety" }] } } };
assert.equal(summarize([partial]).judgeSafetyFailures, 1);
assert.equal(summarize([partial]).fullyJudged, 0);
assert.equal(summarize([partial]).readyRateAllCases, 0);
assert.equal(summarize([{ error: "candidate error" }]).decisionAccuracy, 0);
assert.equal(summarize([rows[0], { error: "candidate error" }]).checkPassRates.decision, 0.5, "missing outputs stay in every check denominator");
const noActions = rows.map((r) => ({ ...r, grades: { ...r.grades, actionScore: 0, factScore: 0 }, trace: { actionPlanSupported: false } }));
assert.equal(pairedComparison(rows, noActions).scenarioMacroDelta, 0, "unsupported proposed capabilities do not lower shared reply score");
assert.equal(summarize(noActions).actionScore, null);
let judgeCalls = 0;
const judgeFailure = await runJudges(guide, reference(guide), async () => {
  if (++judgeCalls === 1) throw new Error("Factual judge unavailable");
  return { content: [{ type: "text", text: JSON.stringify({ usefulness: 3, voice: 3, failures: [], summary: "Usable" }) }] };
});
assert.equal(judgeCalls, 2);
assert.equal(judgeFailure.judges.usefulness.voice, 3);
assert.match(judgeFailure.errors.factual, /unavailable/);
const preserved = await runJudges(guide, reference(guide), async (_request, role) => {
  if (role === "judge:usefulness") throw new Error("Usefulness judge unavailable");
  return { content: [{ type: "text", text: JSON.stringify({ grounding: 0, completeness: 0, failures: [{ kind: "safety", evidence: "Hi Maya", explanation: "Synthetic injected judge verdict to test persistence, not a genuine safety finding." }], summary: "Persistence test" }) }] };
});
assert.equal(preserved.judges.factual.failures[0].kind, "safety");
assert.match(preserved.errors.usefulness, /unavailable/);
const contrasts = contrastCases();
assert.equal(contrasts.length, 8);
for (const testCase of contrasts) {
  assert.equal(gradeFacts(testCase, reference(testCase)).factScore, 1, testCase.id);
  assert.equal(gradeFacts(testCase, reference(testCase)).safetyPass, true, testCase.id);
}
for (let i = 0; i < contrasts.length; i += 2) {
  assert.deepEqual(contrasts[i].input.thread.messages.at(-1), contrasts[i + 1].input.thread.messages.at(-1));
  assert.notDeepEqual(contrasts[i].expected, contrasts[i + 1].expected);
  assert.equal(contrasts[i].split, "development");
}
const impliedAction = { ...reference(alma), reason: contrasts[0].expected.notes };
assert.equal(gradeFacts(contrasts[0], impliedAction).factScore, 1);
assert.equal(gradeFacts(contrasts[1], impliedAction).checks.actionPrecision, false, "completed task must not be recreated");

const root = path.resolve(import.meta.dirname, "../..");
const snapshot = Object.fromEntries(PRODUCTION_FILES.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const captured = [];
let step = 0;
const baseline = await evaluateCurrent(guide.input, snapshot, async (request) => {
  captured.push(request);
  step++;
  const text = step === 1 ? JSON.stringify({ decision: "reply_needed", confidence: "high", reason: "Maya asked how to find and download the guide." })
    : step === 2 ? JSON.stringify({ decision: "draft", confidence: "high", reason: "Verified navigation.", required_sources: ["platform"] }) : scenarios[0].referenceDraft;
  return { content: [{ type: "text", text }], stop_reason: "end_turn" };
});
if (step === 2) {
  assert.equal(baseline.outcome.mode, "hold");
  assert.match(baseline.outcome.reason, /drive/, "explain why the current source gate stops before drafting");
  console.log("Control-flow observation with stub model responses: teacher-guide navigation is held for missing Drive evidence. This is not a Claude benchmark score.");
} else {
  assert.equal(step, 3);
  assert.equal(baseline.outcome.mode, "draft", "a future source-routing fix may remove the unnecessary hold");
}
assert.equal(baseline.trace.actionPlanSupported, false, "do not fabricate capabilities in baseline normalization");
step = 0;
const expanded = await evaluateCurrent({ ...guide.input, sources: [...guide.input.sources, { id: "drive:extra", kind: "drive", title: "Extra test fixture", content: "Lead Unit 2 guide exists." }] }, snapshot, async (request) => {
  captured.push(request); step++;
  return { content: [{ type: "text", text: step === 1 ? JSON.stringify({ decision: "reply_needed", confidence: "high", reason: "Navigation question" }) : step === 2 ? JSON.stringify({ decision: "draft", confidence: "high", reason: "Verified navigation", required_sources: ["platform"] }) : scenarios[0].referenceDraft }], stop_reason: "end_turn" };
});
assert.equal(step, 3, "baseline can exercise actual assessment, preparation, and draft functions");
assert.equal(expanded.outcome.draft, scenarios[0].referenceDraft);
assert.ok(captured.every((request) => !request.messages.some((m) => /"expected"|"answerKey"|"requiredFacts"/.test(m.content))), "answer keys cannot reach subject model");
for (const profile of ["candidate", "no-sources", "no-tasks", "latest-only"]) {
  await evaluateCandidate(all.find((c) => c.scenarioId === "S07").input, profile, async (request) => {
    const context = JSON.parse(request.messages[0].content);
    assert.equal("expected" in context, false);
    if (profile === "no-sources") assert.equal(context.sources.length, 0);
    if (profile === "no-tasks") assert.equal(context.tasks.length, 0);
    if (profile === "latest-only") assert.equal(context.thread.messages.length, 1);
    return { content: [{ type: "text", text: JSON.stringify(reference(guide)) }] };
  });
}
assert.ok(scenarios.find((s) => s.id === "S07").history[0].body.indexOf("Spanish-language") > 4000);
console.log("Email eval harness passed: 50 core emails + 8 context contrasts, duplicate/task-continuity mutations, partial-judge failures, blind inputs, native baseline adapter, ablations, and shared-capability reporting. No paid calls or external writes. Reference checks are NOT Claude scores.");
