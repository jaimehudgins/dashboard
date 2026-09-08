import type { PartnerResponse } from "@/types/partner-response";
import { dateKeyInZone, zonedDateTimeToUtc, zonedParts } from "./time-zone";

export const PREPARATION_WINDOWS = [
  { hour: 8, minute: 0, label: "8:00 AM" },
  { hour: 11, minute: 0, label: "11:00 AM" },
  { hour: 14, minute: 0, label: "2:00 PM" },
  { hour: 16, minute: 45, label: "4:45 PM" },
];

export function preparationWindow(now = new Date()) {
  const local = zonedParts(now);
  const minutes = local.hour * 60 + local.minute;
  if (["Saturday", "Sunday"].includes(local.weekday) || minutes < 480 || minutes >= 1080) return null;
  const slot = PREPARATION_WINDOWS.filter((window) => window.hour * 60 + window.minute <= minutes).at(-1)!;
  const date = dateKeyInZone(now);
  return { key: `${date}:${slot.hour}:${slot.minute}`, label: slot.label, cutoff: zonedDateTimeToUtc(date, slot.hour, slot.minute) };
}

export function nextPreparationLabel(now = new Date()): string {
  const local = zonedParts(now);
  if (["Saturday", "Sunday"].includes(local.weekday)) return "Monday at 8:00 AM Central";
  const next = PREPARATION_WINDOWS.find((slot) => slot.hour * 60 + slot.minute > local.hour * 60 + local.minute);
  return next ? `${next.label} Central` : `${local.weekday === "Friday" ? "Monday" : "Tomorrow"} at 8:00 AM Central`;
}

export function canPrepareResponse(item: PartnerResponse): boolean {
  return item.status === "needs_response" && item.in_inbox && Boolean(item.partner_id) &&
    !item.draft && item.preparation_message_id !== item.message_id;
}

// These actions require Jaime's judgment or actual platform access. A draft
// must never imply that Leo performed them merely because an email requested it.
export function humanActionReason(text: string): string | null {
  if (/\b(security breach|data breach|password|credentials|lawsuit|legal action|refund|pricing|contract|renewal|student data|student roster|student records)\b/i.test(text)) {
    return "This involves sensitive information or a business decision. Jaime should review it before a reply is drafted.";
  }
  if (/\b(add|create|remove|delete|enable|disable|assign|reset|update|change|upload|import)\b[^.!?\n]{0,100}\b(account|staff|reviewer|permission|access|roster|student|alma flag)/i.test(text) ||
      /\b(alma flag|reviewer|staff account)\b/i.test(text)) {
    return "This may require a platform change by Jaime. Confirm the action before preparing a reply.";
  }
  return null;
}

export function requiredReplySources(text: string): ("platform" | "drive" | "crm")[] {
  const required: ("platform" | "drive" | "crm")[] = [];
  if (/\b(platform|log ?in|dashboard|alma|navigate|sign ?in)\b/i.test(text)) required.push("platform");
  if (/\b(curriculum|lesson|teacher guide|resource|syllabus|unit plan|arc of the year)\b/i.test(text)) required.push("drive");
  if (/\b(implementation|commitment|agreed|timeline|partnership plan)\b/i.test(text)) required.push("crm");
  return required;
}
