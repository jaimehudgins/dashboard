import type { ResponseLaneItem } from "./partner-response-lane";

export const CALENDAR_EMAIL_LABELS = {
  invitation: "Invitation",
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Tentative response",
  rescheduled: "Proposed time",
  updated: "Event changed",
  cancelled: "Canceled",
  reminder: "Reminder",
} as const;
export type CalendarEmailKind = keyof typeof CALENDAR_EMAIL_LABELS;
export interface CalendarEnvelope { subject?: string; sender?: string; snippet?: string }

// Routing hints only, not proof of event state or permission to change a calendar.
// Require both a notification subject and calendar-specific evidence. Merely
// mentioning a meeting, an invitation, or a scheduling link is not enough.
export function calendarEmailKind(item: CalendarEnvelope): CalendarEmailKind | null {
  const subject = (item.subject ?? "").slice(0, 1000).trim();
  // A human reply/forward about an invitation belongs in the normal mail queue.
  if (/^(?:re|fw|fwd)\s*:/i.test(subject)) return null;
  const match = /^(updated invitation|cancell?ed invitation|cancell?ed event|cancell?ed|invitation|accepted|declined|tentative(?:ly accepted)?|proposed new time|new time proposed|notification|reminder)\s*:/i.exec(subject);
  if (!match) return null;
  const snippet = (item.snippet ?? "").slice(0, 2000);
  const address = (item.sender ?? "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
  const calendarSender = address === "calendar-notification@google.com"
    || address === "calendar-notification@googlemail.com";
  const datedSubject = /\s@\s.+\b(?:\d{4}|\d{1,2}:\d{2}|\d{1,2}\s*[ap]m)\b/i.test(subject);
  const template = /invitation from google calendar|view (?:on|in) google calendar|(?:has |have )?(?:accepted|declined) this invitation|(?:has |have )?accepted this meeting|you (?:have been|are) invited to (?:this|an) event|(?:when|time)\s*[:\n].{0,180}(?:organizer|guests|where)\s*[:\n]|(?:yes\s*[,·|/]?\s*maybe\s*[,·|/]?\s*no)\s*(?:more options)?|this event has been cancel(?:l)?ed/i.test(snippet);
  if (!calendarSender && !datedSubject && !template) return null;
  const prefix = match[1].toLowerCase();
  if (prefix === "updated invitation") return "updated";
  if (/^cancell?ed/.test(prefix)) return "cancelled";
  if (prefix === "invitation") return "invitation";
  if (prefix === "accepted") return "accepted";
  if (prefix === "declined") return "declined";
  if (prefix.startsWith("tentative")) return "tentative";
  if (prefix.includes("time")) return "rescheduled";
  return "reminder";
}

// Never infer an RSVP or completion from a notification title/snippet alone.
// A full-conversation assessment or current human decision must establish that
// no answer/action remains before a notification moves to Updates only.
export function calendarEmailSection(item: ResponseLaneItem): "calendar_action" | "calendar_updates" {
  const correction = item.response_correction?.message_id === item.message_id ? item.response_correction : null;
  if (correction) return correction.decision === "no_reply" ? "calendar_updates" : "calendar_action";
  const assessment = item.response_assessment?.message_id === item.message_id ? item.response_assessment : null;
  return assessment?.decision === "no_reply" && assessment.confidence === "high"
    ? "calendar_updates" : "calendar_action";
}
