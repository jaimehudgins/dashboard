import { JUDGES, validateJudge, judgeOutputSchema } from "./graders.mjs";
import { textResponse } from "./adapters.mjs";

// One unavailable judge must not erase another judge's verdict or skip it.
export async function runJudges(testCase, outcome, call) {
  const judges = {};
  const errors = {};
  for (const [kind, system] of Object.entries(JUDGES)) {
    try {
      const response = await call({ max_tokens: 1800, system,
        output_config: { format: { type: "json_schema", schema: judgeOutputSchema(kind) } },
        messages: [{ role: "user", content: JSON.stringify({ input: testCase.input, answerKey: testCase.expected, outcome }) }],
      }, `judge:${kind}`);
      judges[kind] = validateJudge(kind, JSON.parse(textResponse(response)), outcome);
    } catch (error) {
      errors[kind] = error instanceof Error ? error.message.slice(0, 300) : "Judge failed";
      if (errors[kind].includes("CALL_BUDGET_EXHAUSTED")) break;
    }
  }
  return { judges, errors };
}
