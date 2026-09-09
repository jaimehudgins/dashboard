import { evaluateRetrieval, retrievalCases } from "./retrieval.mjs";
import { evaluateLifecycle } from "./lifecycle.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { root } from "./offline-runtime.mjs";
import { readBaseline, INTEGRATION_FILES } from "./baseline.mjs";

const args = process.argv.slice(2);
const baselineName = args.includes("--baseline") ? args[args.indexOf("--baseline") + 1] : null;
if (args.includes("--baseline") && !baselineName) throw new Error("Supply --baseline NAME");
const baseline = baselineName ? readBaseline(baselineName) : null;
const retrieval = [];
for (const testCase of retrievalCases) retrieval.push(await evaluateRetrieval(testCase, baseline?.production));
let lifecycle;
try { lifecycle = await evaluateLifecycle(baseline?.production); }
catch (error) { lifecycle = { passed: false, error: error.stack }; }
const productionHashes = Object.fromEntries(INTEGRATION_FILES.map((file) => [file, crypto.createHash("sha256").update(baseline ? baseline.production[file] : fs.readFileSync(path.join(root, file))).digest("hex")]));
console.log(JSON.stringify({ mode: "OFFLINE: synthetic transports, actual local application functions", baseline: baselineName, productionHashes, retrieval, lifecycle }, null, 2));
const failed = retrieval.filter((r) => !r.passed);
console.log(`Retrieval: ${retrieval.length - failed.length}/${retrieval.length} passed. Lifecycle: ${lifecycle.passed ? "passed" : "FAILED"}. No paid calls or external writes.`);
// Real acceptance failures stay red; never bless current bugs as expected passes.
if (failed.length || !lifecycle.passed) process.exitCode = 1;
