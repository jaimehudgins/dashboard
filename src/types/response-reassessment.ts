import type { ResponseNeed } from "@/lib/response-needed-policy";
import type { ResponseStatus } from "./partner-response";

export type ReassessmentScope = "waiting" | "open" | "all";
export const REASSESSMENT_SCOPES: { value: ReassessmentScope; label: string }[] = [
  { value: "open", label: "All open (default)" },
  { value: "waiting", label: "Waiting only" },
  { value: "all", label: "All conversations, including Handled" },
];
export function reassessmentStatuses(scope: ReassessmentScope): ResponseStatus[] {
  if (scope === "waiting") return ["waiting"];
  const open: ResponseStatus[] = ["needs_response", "draft_ready", "needs_input", "waiting"];
  return scope === "all" ? [...open, "handled"] : open;
}

export interface ReassessmentTarget { threadId: string; version: number }
export interface ReassessmentResult extends ReassessmentTarget {
  messageId: string;
  subject: string;
  partner: string;
  status: ResponseStatus;
  decision: ResponseNeed;
  reason: string;
  protectedDecision: boolean;
  canClose: boolean;
}
