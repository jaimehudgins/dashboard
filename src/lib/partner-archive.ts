import type { PartnerResponse } from "@/types/partner-response";

export function archiveWarnings(item: PartnerResponse): string[] {
  const decision = item.response_correction?.message_id === item.message_id ? item.response_correction.decision
    : item.response_assessment?.message_id === item.message_id ? item.response_assessment.decision : null;
  if (item.status === "handled") return [];
  const warnings: string[] = [];
  if (item.follow_up_on) warnings.push(`A follow-up is scheduled for ${item.follow_up_on}. It will no longer appear in active Attention.`);
  if (item.status === "waiting" || decision === "waiting") warnings.push("You may still be waiting for a partner answer.");
  if (["needs_response", "draft_ready"].includes(item.status) || decision === "reply_needed") warnings.push("This conversation may still need your reply. Archiving does not send the draft.");
  if (decision === "action_only") warnings.push("There may be unfinished work. Existing tasks stay open in Work; archiving does not create or complete a task.");
  else if (item.status === "needs_input") warnings.push("This conversation is still marked as needing your input.");
  return warnings;
}

export function archiveConfirmation(item: PartnerResponse): string {
  const warnings = archiveWarnings(item);
  return `Archive “${item.subject || "this conversation"}”?\n\nRemove it from Gmail’s inbox and active Attention. Find it later in Handled recently. Notes, drafts, and linked Work tasks are retained. A new partner email brings it back after the next mail check.${warnings.length ? `\n\nBefore you archive:\n${warnings.join("\n")}\n\nArchive anyway?` : "\n\nNothing is deleted or marked complete in Work."}`;
}
