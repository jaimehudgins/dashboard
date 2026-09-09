import fs from "node:fs";
import path from "node:path";

const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const percent = (value) => value === null ? "N/A" : `${(100 * value).toFixed(1)}%`;
const factScore = (row) => row.error && row.errorPhase !== "judge" ? 0 : row.grades?.factScore ?? 0;
const sharedScore = (row) => row.error && row.errorPhase !== "judge" ? 0 : row.grades?.sharedScore ?? 0;
// Shared reply behavior only. S10 expands beyond the existing partner queue.
const sharedScope = (row) => row.scope ? row.scope === "shared" : row.scenarioId !== "S10";
export function summarize(rows) {
  const confusion = {};
  const styles = {};
  const scenarios = {};
  const styleGroups = {};
  const checkResults = {};
  for (const row of rows) {
    (styles[row.style] ??= []).push(sharedScore(row));
    (scenarios[row.scenarioId] ??= []).push(sharedScore(row));
    (styleGroups[`${row.scenarioId}:${row.repeat}`] ??= []).push(row);
    const predicted = row.outcome?.decision ?? "error";
    const expected = row.expectedDecision ?? "unknown";
    confusion[expected] ??= {};
    confusion[expected][predicted] = (confusion[expected][predicted] ?? 0) + 1;
  }
  // Missing/invalid outcomes must not quietly disappear from check denominators.
  for (const name of new Set(rows.flatMap((r) => Object.keys(r.grades?.checks ?? {})))) {
    checkResults[name] = rows.map((r) => Number(Boolean((!r.error || r.errorPhase === "judge") && r.grades?.checks?.[name])));
  }
  const factualRows = rows.filter((row) => row.judges?.factual);
  const usefulnessRows = rows.filter((row) => row.judges?.usefulness);
  const judgeRows = rows.filter((row) => row.judges?.factual && row.judges?.usefulness && !row.error);
  const highQuality = (row) => row.grades?.safetyPass && row.grades.factScore === 1 && row.judges.factual.grounding >= 3 && row.judges.factual.completeness >= 3 && row.judges.usefulness.usefulness >= 3 && row.judges.usefulness.voice >= 3 && !row.judges.factual.failures.some((f) => f.kind === "safety");
  return {
    rows: rows.length, errors: rows.filter((r) => r.error).length,
    candidateErrors: rows.filter((r) => r.error && r.errorPhase !== "judge").length,
    judgeErrors: rows.filter((r) => r.errorPhase === "judge").length,
    factScore: mean(rows.map(factScore)),
    sharedScore: mean(rows.filter(sharedScope).map(sharedScore)),
    sharedScopeRows: rows.filter(sharedScope).length,
    extensionRows: rows.filter((r) => !sharedScope(r)).length,
    actionPlanSupported: rows.every((r) => r.trace?.actionPlanSupported !== false),
    actionScore: rows.some((r) => r.trace?.actionPlanSupported === false) ? null : mean(rows.map((r) => r.grades?.actionScore ?? 0)),
    decisionAccuracy: mean(rows.map((r) => Number(Boolean((!r.error || r.errorPhase === "judge") && r.grades?.checks?.decision)))),
    modeAccuracy: mean(rows.map((r) => Number(Boolean((!r.error || r.errorPhase === "judge") && r.grades?.checks?.mode)))),
    hardGatePassRate: mean(rows.map((r) => Number(Boolean((!r.error || r.errorPhase === "judge") && r.grades?.safetyPass)))),
    fullyJudged: judgeRows.length, judgedReadyRate: mean(judgeRows.map((r) => Number(highQuality(r)))),
    readyRateAllCases: mean(rows.map((r) => Number(judgeRows.includes(r) && highQuality(r)))),
    judgeCoverage: { factual: factualRows.length, usefulness: usefulnessRows.length },
    judgeScores: Object.fromEntries(["grounding", "completeness", "usefulness", "voice"].map((key) => {
      const kind = ["grounding", "completeness"].includes(key) ? "factual" : "usefulness";
      return [key, mean((kind === "factual" ? factualRows : usefulnessRows).map((r) => r.judges[kind][key]))];
    })),
    judgeSafetyFailures: factualRows.filter((r) => r.judges.factual.failures.some((f) => f.kind === "safety")).length,
    inputTokens: rows.flatMap((r) => r.calls ?? []).filter((c) => !c.role.startsWith("judge:")).reduce((n, c) => n + (c.usage?.input_tokens ?? 0) + (c.usage?.cache_read_input_tokens ?? 0) + (c.usage?.cache_creation_input_tokens ?? 0), 0),
    outputTokens: rows.flatMap((r) => r.calls ?? []).filter((c) => !c.role.startsWith("judge:")).reduce((n, c) => n + (c.usage?.output_tokens ?? 0), 0),
    meanCandidateMs: mean(rows.map((r) => (r.calls ?? []).filter((c) => !c.role.startsWith("judge:")).reduce((n, c) => n + c.ms, 0))),
    decisionConfusion: confusion, byStyle: Object.fromEntries(Object.entries(styles).map(([style, scores]) => [style, mean(scores)])),
    byScenario: Object.fromEntries(Object.entries(scenarios).map(([id, scores]) => [id, mean(scores)])),
    checkPassRates: Object.fromEntries(Object.entries(checkResults).map(([id, values]) => [id, mean(values)])),
    styleConsistency: mean(Object.values(styleGroups).filter((group) => group.length === 5 && new Set(group.map((r) => r.style)).size === 5).map((group) => Number(group.every((r) => !r.error || r.errorPhase === "judge") && new Set(group.map((r) => `${r.outcome?.decision}:${r.outcome?.mode}`)).size === 1))),
  };
}

export function pairedComparison(baseline, candidate) {
  const key = (r) => `${r.id}:${r.repeat}`;
  const left = new Map(baseline.map((r) => [key(r), r]));
  const right = new Map(candidate.map((r) => [key(r), r]));
  if (left.size !== baseline.length || right.size !== candidate.length || left.size !== right.size || [...left.keys()].some((k) => !right.has(k))) throw new Error("Comparison requires identical unique case/repeat coverage; do not silently drop failures.");
  if ([...left].some(([k, a]) => sharedScope(a) !== sharedScope(right.get(k)))) throw new Error("Comparison scope differs between profiles.");
  const pairs = [...left].filter(([, a]) => sharedScope(a)).map(([k, a]) => ({ id: k, scenarioId: a.scenarioId, delta: sharedScore(right.get(k)) - sharedScore(a) }));
  const groups = {};
  for (const p of pairs) (groups[p.scenarioId] ??= []).push(p.delta);
  const deltas = Object.values(groups).map(mean);
  // Paired cluster bootstrap: styles/repeats within a scenario are NOT treated
  // as independent scenarios. This small synthetic suite is exploratory only.
  let seed = 713;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
  const samples = Array.from({ length: 2000 }, () => mean(deltas.map(() => deltas[Math.floor(random() * deltas.length)]))).sort((a, b) => a - b);
  return { metric: "sharedScore: decision, mode, required draft facts, outstanding-item visibility", extensionRowsExcluded: baseline.length - pairs.length, scenarioMacroDelta: mean(deltas), clusterCI95: deltas.length < 2 ? null : [samples[50], samples[1949]], improved: pairs.filter((p) => p.delta > 0), regressed: pairs.filter((p) => p.delta < 0), unchanged: pairs.filter((p) => p.delta === 0).length };
}

function readRun(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  const rows = fs.readFileSync(path.join(directory, "results.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  if (manifest.status === "complete" && (rows.length !== manifest.plannedRows || manifest.rows !== rows.length || rows.some((r) => !manifest.caseIds.includes(r.id) || r.repeat < 1 || r.repeat > manifest.repeats))) throw new Error("Run coverage does not match its manifest.");
  return { manifest, rows };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [directory, candidateDirectory] = process.argv.slice(2);
  if (!directory) throw new Error("Usage: node evals/partner-email/report.mjs RUN_DIRECTORY [CANDIDATE_DIRECTORY]");
  const base = readRun(directory);
  const summary = summarize(base.rows);
  console.log(JSON.stringify({ manifest: base.manifest, summary }, null, 2));
  console.log(`Decision accuracy ${percent(summary.decisionAccuracy)}. Hard checks ${percent(summary.hardGatePassRate)}. ${summary.fullyJudged}/${summary.rows} fully judged. Unjudged does NOT mean approved.`);
  if (candidateDirectory) {
    const next = readRun(candidateDirectory);
    if (base.manifest.datasetHash !== next.manifest.datasetHash || base.manifest.status !== "complete" || next.manifest.status !== "complete") throw new Error("Use complete runs on the same frozen dataset.");
    if (base.manifest.judgeVersion !== next.manifest.judgeVersion || base.manifest.harnessHashes["graders.mjs"] !== next.manifest.harnessHashes["graders.mjs"]) throw new Error("Grader changed; regrade both runs before comparison.");
    console.log(JSON.stringify({ candidate: summarize(next.rows), paired: pairedComparison(base.rows, next.rows),
      confounds: { modelChanged: base.manifest.model !== next.manifest.model, judgeModelChanged: base.manifest.judgeModel !== next.manifest.judgeModel, productionChanged: JSON.stringify(base.manifest.productionHashes) !== JSON.stringify(next.manifest.productionHashes) } }, null, 2));
  }
}
