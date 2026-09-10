import type { PartnerResponse } from "@/types/partner-response";

export type ResponseLaneItem = Pick<PartnerResponse,
  "status" | "message_id" | "response_assessment" | "response_correction">;

// A view of needs_input, not a new writable status. Old assessments must not
// categorize a newer message, and human decisions always override suggestions.
export function isActionNeeded(item: ResponseLaneItem): boolean {
  if (item.status !== "needs_input") return false;
  if (item.response_correction?.message_id === item.message_id) {
    return item.response_correction.decision === "action_only";
  }
  return item.response_assessment?.message_id === item.message_id
    && item.response_assessment.decision === "action_only"
    && item.response_assessment.confidence === "high";
}
