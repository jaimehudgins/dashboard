// Offline notification routing checks. No Google Calendar/Gmail/model calls.
import assert from "node:assert/strict";
import { moduleAt } from "../evals/partner-email/offline-runtime.mjs";

const { calendarEmailKind, calendarEmailSection } = moduleAt("src/lib/calendar-email.ts");
const fixtures = [
  ["Invitation: Willow implementation @ Thu Sep 10, 2026 10am", "invitation"],
  ["Updated invitation: Willow implementation @ Thu Sep 10, 2026 11am", "updated"],
  ["Accepted: Willow implementation @ Thu Sep 10, 2026 10am", "accepted"],
  ["Declined: Willow implementation @ Thu Sep 10, 2026 10am", "declined"],
  ["Tentative: Willow implementation @ Thu Sep 10, 2026 10am", "tentative"],
  ["Proposed new time: Willow implementation @ Thu Sep 10, 2026 1pm", "rescheduled"],
  ["New time proposed: Willow implementation @ Thu Sep 10, 2026 1pm", "rescheduled"],
  ["Canceled: Willow implementation @ Thu Sep 10, 2026 10am", "cancelled"],
  ["Cancelled event: Willow implementation @ Thu Sep 10, 2026 10am", "cancelled"],
  ["Reminder: Willow implementation @ Thu Sep 10, 2026 10am", "reminder"],
  ["Notification: Willow implementation @ Thu Sep 10, 2026 10am", "reminder"],
];
for (const [subject, kind] of fixtures) {
  assert.equal(calendarEmailKind({ subject, sender: "Partner <person@school.example>" }), kind, subject);
}
assert.equal(calendarEmailKind({ subject: "Accepted: Planning meeting", snippet: "Morgan has accepted this invitation." }), "accepted");
assert.equal(calendarEmailKind({ subject: "Invitation: Planning meeting", snippet: "Invitation from Google Calendar" }), "invitation");
assert.equal(calendarEmailKind({ subject: "Reminder: Planning meeting", sender: "Google Calendar <calendar-notification@google.com>" }), "reminder");
assert.equal(calendarEmailKind({ subject: "Reminder: invoice", sender: "calendar-notification@google.com.evil.example" }), null, "provider address cannot match a lookalike domain");
for (const subject of ["Can we meet Tuesday?", "Invitation: join our conference", "Accepted: your proposal", "Reminder: submit your roster", "Our calendar for the year", "The meeting was canceled", "Re: Invitation: Planning @ Thu Sep 10, 2026 10am", "Fwd: Accepted: Planning @ Thu Sep 10, 2026 10am"]) {
  assert.equal(calendarEmailKind({ subject, snippet: "Could you help me?" }), null, subject);
}
assert.equal(calendarEmailKind({ subject: "Let's meet", snippet: "https://calendar.google.com/calendar/u/0/r" }), null, "a calendar link alone is not a notification");
assert.equal(calendarEmailKind({}), null);

const base = { status: "needs_input", message_id: "latest" };
const assessment = { message_id: "latest", decision: "no_reply", confidence: "high" };
assert.equal(calendarEmailSection(base), "calendar_action", "unassessed notifications are not assumed informational");
assert.equal(calendarEmailSection({ ...base, response_assessment: assessment }), "calendar_updates");
for (const confidence of ["medium", "low"]) assert.equal(calendarEmailSection({ ...base, response_assessment: { ...assessment, confidence } }), "calendar_action");
assert.equal(calendarEmailSection({ ...base, response_assessment: { ...assessment, message_id: "old" } }), "calendar_action", "new messages need fresh assessment");
for (const decision of ["reply_needed", "action_only", "judgment", "waiting"]) {
  assert.equal(calendarEmailSection({ ...base, response_assessment: assessment, response_correction: { message_id: "latest", decision } }), "calendar_action", "current human correction takes priority");
}
assert.equal(calendarEmailSection({ ...base, response_correction: { message_id: "latest", decision: "no_reply" } }), "calendar_updates");
assert.equal(calendarEmailSection({ ...base, response_assessment: assessment, response_correction: { message_id: "old", decision: "reply_needed" } }), "calendar_updates");
const addedQuestion = { ...base, subject: fixtures[2][0], snippet: "Accepted. Could you also send the new lesson materials?", response_assessment: { ...assessment, decision: "reply_needed" } };
assert.equal(calendarEmailKind(addedQuestion), "accepted");
assert.equal(calendarEmailSection(addedQuestion), "calendar_action", "acceptance with a question stays actionable");
console.log("Calendar email checks passed: notification signatures, ordinary mail isolation, confidence, human decisions, stale messages, and added questions.");
