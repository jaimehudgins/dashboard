// Offline only; no database writes or model calls.
// Run: node scripts/check-workbench-completion.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import * as icons from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";

const workbench = moduleAt("src/lib/workbench.ts");
const statuses = ["researching", "needs_input", "draft_ready", "reviewed", "failed", "human_only"];
const makeRun = (id, status) => ({
  id, taskId: id, taskTitle: `Task ${id}`, status, sources: [], draft: `Saved draft ${id}`,
  notificationTier: "none", updatedAt: "2026-09-09T12:00:00Z",
});
const runs = statuses.flatMap((status) => [makeRun(`done-${status}`, status), makeRun(`open-${status}`, status)]);
const before = JSON.stringify(runs);
const completed = statuses.map((status) => `done-${status}`);
const open = workbench.openTaskWorkRuns(runs, completed);
assert.equal(open.length, statuses.length);
assert.ok(open.every((run) => run.taskId.startsWith("open-")), "every run status respects task completion");
assert.equal(JSON.stringify(runs), before, "filter must not delete or change drafts, sources, or run status");
assert.equal(workbench.openTaskWorkRuns(runs, []).length, runs.length, "reopening tasks restores saved work");
assert.equal(workbench.openTaskWorkRuns(runs, ["unknown"] ).length, runs.length);
assert.equal(workbench.openTaskWorkRuns(runs, runs.map((run) => run.taskId)).length, 0);
assert.equal(workbench.openTaskWorkRuns(JSON.parse(before), completed).length, open.length, "completion survives data reload");
const versions = [makeRun("one", "reviewed"), { ...makeRun("two", "draft_ready"), taskId: "one" }];
assert.equal(workbench.openTaskWorkRuns(versions, ["one"]).length, 0, "all runs belonging to the completed task disappear");

const exports = {};
const mocks = { react: React, "react/jsx-runtime": jsx, "lucide-react": icons, "@/lib/workbench": workbench };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/components/WorkbenchPanel.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, { exports, require(id) {
  if (id in mocks) return mocks[id];
  throw new Error(`Unexpected dependency: ${id}`);
}, Date, Intl, console });
const render = (items) => renderToStaticMarkup(React.createElement(exports.default, {
  runs: items, completedTaskIds: completed, loading: false, configured: true,
  onRefresh: async () => {}, onRevise: async () => {}, onCompleteTask() {},
}));
const markup = render(open);
assert.doesNotMatch(markup, /Task done-/, "completed tasks vanish from active and reviewed sections");
for (const status of statuses.filter((status) => status !== "human_only")) assert.match(markup, new RegExp(`Task open-${status}`));
assert.equal(render([]), "", "empty Workbench disappears");
const crowded = [...Array.from({ length: 12 }, (_, i) => makeRun(`old-${i}`, "needs_input")), makeRun("remaining", "draft_ready")];
assert.match(render(workbench.openTaskWorkRuns(crowded, crowded.slice(0, 12).map((run) => run.taskId))), /Task remaining/, "filter completion before the ten-card display limit");

const hub = fs.readFileSync("src/components/WorkHub.tsx", "utf8");
assert.match(hub, /openTaskWorkRuns\(workRuns, completedTaskIds\)/);
assert.match(hub, /\[workRuns, completedTaskIds\]/, "task-state changes recompute visibility without a Workbench refresh");
assert.match(hub, /runs=\{openWorkRuns\}/);
assert.match(hub, /workRuns=\{workRuns\}/, "task table keeps saved history, including completed-task detail context");
assert.doesNotMatch(hub, /(?:Count =|leoRuns =) workRuns/, "summary counters and weekly view use open runs");
console.log("Workbench completion checks passed: all statuses, immediate derived updates, pagination limit, counts, saved history, reopening, and rendered UI.");
