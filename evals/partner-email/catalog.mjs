import fs from "node:fs";
import path from "node:path";
import { scenarios, STYLES } from "./dataset.mjs";
import { contrastCases } from "./contrast-cases.mjs";

const lines = ["# Leo email evaluation: 10 scenarios, 50 emails", "", "Generated from dataset.mjs. All names, links, platform instructions, and records are synthetic test fixtures, not operational facts. Do not send these emails or open the fixture links.", "", "Styles: warm, terse with typos, formal, rambling, impatient. The facts and expected outcome remain constant within each scenario; tone alone must not create urgency or a new commitment.", ""];
for (const scenario of scenarios) {
  lines.push(`## ${scenario.id}: ${scenario.title}`, "", `Split: ${scenario.split}. Subject: ${scenario.subject}. Sender: ${scenario.from}.`, "", `Expected decision: **${scenario.expected.decision}**. Draft mode: **${scenario.expected.mode}**.`, "", scenario.expected.notes, "", "### Evidence and prior context", "");
  for (const m of scenario.history) lines.push(`Prior email from ${m.from}:`, "", m.body, "");
  for (const task of scenario.tasks) lines.push(`- Work task: ${task.title}. Status: ${task.status}.`);
  for (const source of scenario.sources) lines.push(`- ${source.id}: ${source.content}`);
  lines.push("");
  scenario.variants.forEach((body, i) => lines.push(`### Variant ${i + 1}: ${STYLES[i]}`, "", body, ""));
  lines.push("### Fact assertions", "", `Required facts in draft: ${scenario.expected.requiredFacts.join("; ") || "None; assess decision/action instead."}`, "", `Required source IDs: ${scenario.expected.requiredSources.join(", ") || "Thread/task evidence sufficient."}`, "", `Proposed actions: ${JSON.stringify(scenario.expected.expectedActions)}`, "", `Forbidden draft claims: ${scenario.expected.forbiddenFacts.join("; ") || "Standard safety gates apply."}`, "");
}
const output = path.join(import.meta.dirname, "SCENARIOS.md");
fs.writeFileSync(output, lines.join("\n").replace(/[\t ]+$/gm, ""));
console.log(`Generated ${output}`);
const review = ["# Ten email decisions for Jaime to review", "", "Generated from synthetic fixture answer keys, NOT Claude outputs or proven scores. Three handling defaults have been confirmed; see HANDLING-POLICY.md. Other case-specific details remain proposed. Full histories, task state, and sources are in SCENARIOS.md. Please approve or correct remaining details before a paid run.", "", "For each item: Is the decision right? Is any task missing or unnecessary? Should Leo acknowledge while you act, or stay quiet? Note your preferred wording/behavior. After model runs we will separately record accept/minor edit/major edit/reject and editing time.", ""];
for (const scenario of scenarios) {
  review.push(`## ${scenario.id}: ${scenario.title}`, "", `**Incoming email:** ${scenario.variants[0]}`, "", `**Proposed handling:** ${scenario.expected.decision}; ${scenario.expected.mode}. ${scenario.expected.notes}`, "", "Your correction / approval: ______", "");
}
review.push("## Additional context-sensitive checks", "", "These eight development cases reuse four incoming emails while changing only surrounding evidence:", "");
for (const testCase of contrastCases()) review.push(`- ${testCase.id}: ${testCase.expected.decision}/${testCase.expected.mode}. ${testCase.expected.notes}`);
review.push("", "Confirmed defaults: enrich the existing ALMA task without an acknowledgment unless another question needs answering; surface every unanswered part; require review-only acknowledgment and an urgent Slack alert for urgent platform issues. Completion emails remain a recommendation awaiting approval, not permission to auto-send. See HANDLING-POLICY.md.", "");
const reviewPath = path.join(import.meta.dirname, "REVIEW-CASES.md");
fs.writeFileSync(reviewPath, review.join("\n"));
console.log(`Generated ${reviewPath}`);
