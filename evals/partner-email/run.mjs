import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { cases, DATASET_VERSION } from "./dataset.mjs";
import { contrastCases } from "./contrast-cases.mjs";
import { gradeFacts, JUDGE_VERSION } from "./graders.mjs";
import { runJudges } from "./judge-runner.mjs";
import { CANDIDATE_VERSION } from "./prompts.mjs";
import { evaluateCurrent, evaluateCandidate, PRODUCTION_FILES, PROFILES } from "./adapters.mjs";
import { readBaseline } from "./baseline.mjs";

const args = process.argv.slice(2);
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const integer = (flag, fallback, max) => {
  const n = Number(value(flag, fallback));
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`Invalid ${flag}`);
  return n;
};
const root = path.resolve(import.meta.dirname, "../..");
const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");
const profile = value("--profile", "current");
if (!PROFILES.includes(profile)) throw new Error(`--profile must be ${PROFILES.join(", ")}`);
const split = value("--split", "all");
if (!["all", "development", "holdout"].includes(split)) throw new Error("Invalid split");
const repeats = integer("--repeats", 1, 10);
const maxCalls = integer("--max-calls", 30, 2000);
const suite = value("--suite", "core");
if (!["core", "contrast", "all"].includes(suite)) throw new Error("Invalid suite");
const fixtures = suite === "core" ? cases() : suite === "contrast" ? contrastCases() : [...cases(), ...contrastCases()];
const limit = integer("--limit", fixtures.length, 58);
const selected = fixtures.filter((c) => split === "all" || c.split === split).slice(0, limit);
if (!selected.length) throw new Error("No cases selected; contrast cases are development-only.");
const judging = args.includes("--judge");
const model = value("--model", null);
const judgeModel = value("--judge-model", null);
const baselineName = value("--baseline", null);
if (args.includes("--baseline") && !baselineName) throw new Error("Supply --baseline NAME");
if (baselineName && profile !== "current") throw new Error("--baseline selects frozen application code for the current profile only.");
const baseline = baselineName ? readBaseline(baselineName) : null;
const snapshot = Object.fromEntries(PRODUCTION_FILES.map((file) => [file, baseline ? baseline.production[file] : fs.readFileSync(path.join(root, file), "utf8")]));
const harnessFiles = ["dataset.mjs", "contrast-cases.mjs", "graders.mjs", "prompts.mjs", "adapters.mjs", "run.mjs", "report.mjs", "judge-runner.mjs", "baseline.mjs"];
const manifest = {
  datasetVersion: DATASET_VERSION, datasetHash: sha(JSON.stringify(fixtures)), suite, candidateVersion: CANDIDATE_VERSION,
  baseline: baselineName, baselineCreatedAt: baseline?.createdAt ?? null,
  baselineFixturesChanged: baseline ? sha(JSON.stringify([...cases(), ...contrastCases()])) !== baseline.fixturesHash : null,
  dependencyLockHash: sha(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")),
  judgeVersion: JUDGE_VERSION, profile, model, judgeModel: judging ? judgeModel : null, split, repeats,
  caseIds: selected.map((c) => c.id), plannedRows: selected.length * repeats, maxCalls,
  maximumLogicalCalls: selected.length * repeats * ((profile === "current" ? 3 : 1) + (judging ? 2 : 0)),
  productionHashes: Object.fromEntries(Object.entries(snapshot).map(([file, text]) => [file, sha(text)])),
  harnessHashes: Object.fromEntries(harnessFiles.map((file) => [file, sha(fs.readFileSync(path.join(import.meta.dirname, file), "utf8"))])),
  retrieval: "Fixed synthetic evidence, not a live Gmail/Drive/CRM integration test",
};
if (!args.includes("--execute")) {
  console.log(JSON.stringify({ ...manifest, mode: "PLAN ONLY: zero API calls; add --execute for paid model calls. Monetary cost is not estimated without your account's current rates." }, null, 2));
  process.exit(0);
}
if (!model || (judging && !judgeModel)) throw new Error("Live runs require explicit --model and, with --judge, --judge-model IDs available to your account.");
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required; never paste it into a command or report.");
const name = value("--name", null);
if (!name || !/^[a-zA-Z0-9_-]{1,80}$/.test(name)) throw new Error("Supply a unique --name using letters, digits, underscores, or hyphens.");
const directory = path.join(import.meta.dirname, "runs", name);
if (fs.existsSync(directory)) throw new Error("Run already exists. Use a new name; baselines are never overwritten.");
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, "production-snapshot.json"), JSON.stringify(snapshot, null, 2));
fs.writeFileSync(path.join(directory, "fixtures.json"), JSON.stringify(selected, null, 2));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 65_000 });
let callCount = 0;
let completed = 0;
let stop = false;
const startedAt = new Date().toISOString();
function writeManifest(status) {
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ ...manifest, startedAt, status, rows: completed, calls: callCount, updatedAt: new Date().toISOString() }, null, 2));
}
writeManifest("running");
for (let repeat = 1; repeat <= repeats && !stop; repeat++) {
  for (const testCase of selected) {
    const calls = [];
    const call = async (request, role) => {
      if (callCount >= maxCalls) throw new Error("CALL_BUDGET_EXHAUSTED");
      callCount++;
      const payload = { ...request, model: role.startsWith("judge:") ? judgeModel : model };
      const started = performance.now();
      try {
        const response = await client.messages.create(payload);
        calls.push({ role, request: payload, response: response.content, usage: response.usage, model: response.model, ms: performance.now() - started });
        return response;
      } catch (error) {
        calls.push({ role, ms: performance.now() - started, error: error instanceof Error ? error.name : "Request error" });
        throw error;
      }
    };
    const row = { id: testCase.id, scenarioId: testCase.scenarioId, style: testCase.style, scope: testCase.input.partner ? "shared" : "extension", split: testCase.split, expectedDecision: testCase.expected.decision, expectedMode: testCase.expected.mode, repeat, calls,
      trace: { adapter: profile, actionPlanSupported: profile !== "current", claimLedgerSupported: profile !== "current" } };
    try {
      const result = profile === "current" ? await evaluateCurrent(testCase.input, snapshot, call) : await evaluateCandidate(testCase.input, profile, call);
      Object.assign(row, result, { grades: gradeFacts(testCase, result.outcome) });
      if (result.trace.queueStatus === "handled") { row.grades.safetyPass = false; row.grades.failures.push("automaticClosure"); }
      row.judges = {};
      if (judging && row.grades.valid) {
        const judged = await runJudges(testCase, result.outcome, call);
        row.judges = judged.judges;
        row.judgeErrors = judged.errors;
        if (Object.keys(judged.errors).length) {
          row.errorPhase = "judge";
          row.error = Object.values(judged.errors).join("; ");
          if (row.error.includes("CALL_BUDGET_EXHAUSTED")) stop = true;
        }
      }
    } catch (error) {
      row.errorPhase = row.outcome ? "judge" : "candidate";
      row.error = error instanceof Error ? error.message.slice(0, 300) : "Eval failed";
      row.grades ??= { valid: false, safetyPass: false, factScore: 0, checks: {}, failures: ["execution_error"], judgeRequired: true };
      if (row.error.includes("CALL_BUDGET_EXHAUSTED")) stop = true;
    }
    fs.appendFileSync(path.join(directory, "results.jsonl"), JSON.stringify(row) + "\n");
    completed++;
    writeManifest("running");
    console.log(`${testCase.id} repeat ${repeat}: ${row.error ? "error" : "recorded"}`);
    if (stop) break;
  }
}
writeManifest(stop ? "incomplete_budget" : "complete");
console.log(`Saved ${completed} rows to ${directory}. No emails, CRM writes, or tasks were executed.`);
if (stop) process.exitCode = 1;
