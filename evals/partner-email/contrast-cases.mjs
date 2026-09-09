import { cases } from "./dataset.mjs";

// Development-only counterfactuals: each pair has the SAME incoming email.
// Context, not writing style or explicit routing words, must change the outcome.
export function contrastCases() {
  const base = (scenario, id) => {
    const row = structuredClone(cases().find((c) => c.scenarioId === scenario));
    return { ...row, id, sourceScenarioId: scenario, scenarioId: id.split("-")[0], style: "context_pair", split: "development" };
  };
  const replaceLatest = (row, text) => {
    Object.assign(row.input.thread.messages.at(-1), { body: text, cleanBody: text, snippet: text });
  };
  const pending = base("S03", "C01-pending");
  replaceLatest(pending, "Our reviewers will be Ana Morales (ana@cedarridge.example) and Ben Lewis (ben@cedarridge.example). Thanks!");
  const completed = structuredClone(pending);
  completed.id = "C01-completed";
  Object.assign(completed.input.tasks[0], { status: "completed", completed_at: "2026-09-08T13:45:00Z", description: "Jaime verified both Ana Morales and Ben Lewis were added as ALMA staff after this email arrived. No remaining action." });
  completed.input.sources[0].content = "Existing partner: Cedar Ridge School. CRM snapshot from 13:00 UTC predates Jaime's 13:45 UTC verified task completion. ALMA staff additions are performed by Jaime.";
  completed.expected = { ...completed.expected, decision: "no_reply", expectedActions: [], notes: "Both reviewers were already added after the email arrived. Suggest closure, not another task or a filler reply." };

  const unanswered = base("S07", "C02-unanswered");
  const answered = structuredClone(unanswered);
  answered.id = "C02-answered";
  const sent = "Here are both the teacher guide and the Spanish family information sheet: https://docs.google.com/document/d/EVAL_FAMILY_INFO_ES/edit";
  Object.assign(answered.input.thread.messages[1], { body: sent, cleanBody: sent, snippet: sent });
  answered.input.tasks[0].status = "completed";
  answered.expected = { ...answered.expected, decision: "no_reply", mode: "none", requiredFacts: [], requiredReasonFacts: [], requiredSources: [], notes: "The earlier sent email fulfilled both requests. Latest thanks adds no new request. Suggest closure only." };

  const verified = base("S01", "C03-verified");
  const unavailable = structuredClone(verified);
  unavailable.id = "C03-unavailable";
  unavailable.input.sources = [];
  unavailable.expected = { ...unavailable.expected, decision: "judgment", mode: "hold", requiredFacts: [], requiredSources: [], notes: "No verified navigation evidence is available. Surface that limitation rather than inventing steps or claiming account access." };

  const newContacts = base("S04", "C04-new");
  const knownContacts = structuredClone(newContacts);
  knownContacts.id = "C04-known";
  knownContacts.input.sources.find((s) => s.id === "crm:northstar").content = "Northstar Academy already exists in TEMU, ID northstar. Morgan Lee is an existing contact. Current verified contacts already associated with this partner: Priya Shah <priya@northstar.example>, implementation lead; Devon Reed <devon@northstar.example>, counselor. No new contact records are needed. Taylor is Willow staff.";
  knownContacts.expected = { ...knownContacts.expected, expectedActions: [], notes: "Send the checklist; both people already have associated CRM contacts. Do not propose duplicate contact records." };
  return [pending, completed, unanswered, answered, verified, unavailable, newContacts, knownContacts];
}
