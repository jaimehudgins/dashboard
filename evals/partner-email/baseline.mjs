import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PRODUCTION_FILES } from "./adapters.mjs";
import { cases } from "./dataset.mjs";
import { contrastCases } from "./contrast-cases.mjs";

const root = path.resolve(import.meta.dirname, "../..");
export const INTEGRATION_FILES = ["src/lib/reply-sources.ts", "src/lib/drive.ts", "src/lib/gmail-history.ts", "src/lib/partner-mail-sync.ts", "src/lib/partner-response-store.ts", "src/lib/partner-reply-status.ts", "src/lib/response-needed-policy.ts", "src/types/partner-response.ts", "src/app/api/partner-responses/route.ts"];
export const BASELINE_FILES = [...new Set([...PRODUCTION_FILES, ...INTEGRATION_FILES])];
export const HARNESS_FILES = ["adapters.mjs", "baseline.mjs", "catalog.mjs", "check.mjs", "contrast-cases.mjs", "dataset.mjs", "graders.mjs", "integration.mjs", "judge-runner.mjs", "lifecycle.mjs", "offline-runtime.mjs", "prompts.mjs", "report.mjs", "retrieval.mjs", "run.mjs"];
export const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const digest = (object) => Object.fromEntries(Object.entries(object).map(([key, text]) => [key, sha(text)]));
function baselinePath(name) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name ?? "")) throw new Error("Use a baseline name with letters, numbers, hyphens, or underscores.");
  return path.join(import.meta.dirname, "baselines", `${name}.json`);
}
export function validateBaseline(bundle) {
  if (bundle.format !== 1) throw new Error("Unsupported baseline format");
  for (const file of BASELINE_FILES) {
    if (typeof bundle.production?.[file] !== "string" || sha(bundle.production[file]) !== bundle.productionHashes?.[file]) throw new Error(`Baseline source missing or changed: ${file}`);
  }
  for (const file of HARNESS_FILES) {
    if (typeof bundle.harness?.[file] !== "string" || sha(bundle.harness[file]) !== bundle.harnessHashes?.[file]) throw new Error(`Baseline harness missing or changed: ${file}`);
  }
  if (!bundle.fixtures || sha(JSON.stringify(bundle.fixtures)) !== bundle.fixturesHash) throw new Error("Baseline fixtures changed");
  return bundle;
}
export function readBaseline(name) {
  return validateBaseline(JSON.parse(fs.readFileSync(baselinePath(name), "utf8")));
}
export function freezeBaseline(name) {
  const output = baselinePath(name);
  const production = Object.fromEntries(BASELINE_FILES.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
  const harness = Object.fromEntries(HARNESS_FILES.map((file) => [file, fs.readFileSync(path.join(import.meta.dirname, file), "utf8")]));
  const fixtures = [...cases(), ...contrastCases()];
  const bundle = { format: 1, name, createdAt: new Date().toISOString(),
    provenance: "Local working-tree code, including uncommitted work. Not verified as the deployed version. No measured Claude scores.",
    production, productionHashes: digest(production), harness, harnessHashes: digest(harness),
    fixtures, fixturesHash: sha(JSON.stringify(fixtures)),
    dependencyLockHash: sha(fs.readFileSync(path.join(root, "package-lock.json"))),
  };
  validateBaseline(bundle);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  // Exclusive creation: no command can silently replace the reference snapshot.
  fs.writeFileSync(output, JSON.stringify(bundle, null, 2) + "\n", { flag: "wx" });
  return output;
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [command, name] = process.argv.slice(2);
  if (command === "freeze") console.log(`Frozen baseline: ${freezeBaseline(name)}. No API calls, secrets, or application writes.`);
  else if (command === "verify") {
    const bundle = readBaseline(name);
    console.log(`Verified ${bundle.name}: ${BASELINE_FILES.length} application files, ${bundle.fixtures.length} cases. Not a model benchmark.`);
  } else throw new Error("Usage: node evals/partner-email/baseline.mjs freeze|verify NAME");
}
