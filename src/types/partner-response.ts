import type { ResponseAssessment, ResponseCorrection } from "@/lib/response-needed-policy";

export type ResponseStatus = "needs_response" | "draft_ready" | "needs_input" | "waiting" | "handled";
export type ResponseSource = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  url?: string;
};

export interface PartnerResponse {
  thread_id: string;
  partner_id: string | null;
  partner_name: string;
  subject: string;
  sender: string;
  snippet: string;
  message_id: string;
  received_at: string | null;
  in_inbox: boolean;
  urgency: "now" | "question" | "later";
  confidence: "high" | "medium" | "low";
  reason: string;
  status: ResponseStatus;
  notes: string;
  follow_up_on: string | null;
  draft: string;
  draft_message_id: string | null;
  draft_sources: ResponseSource[];
  version: number;
  updated_at: string;
  preparation_message_id?: string | null;
  preparation_reason?: string | null;
  preparation_batch_key?: string | null;
  response_assessment?: ResponseAssessment | null;
  response_correction?: ResponseCorrection | null;
  response_assessment_retry_at?: string | null;
}

export interface MailSyncState {
  history_id: string | null;
  page_token: string | null;
  pending_thread_ids: string[] | null;
  pending_history_id: string | null;
  pending_mode: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  lock_until: string | null;
  last_mode: string | null;
  changed_count: number;
}

export function responseAfterMessage(
  previous: PartnerResponse | null,
  messageId: string,
  incoming: boolean,
  matched: boolean,
): ResponseStatus {
  // Read/unread and label changes must never undo a human's review decision.
  if (previous?.message_id === messageId) return previous.status;
  if (!incoming) return previous?.status === "handled" ? "handled" : "waiting";
  return matched ? "needs_response" : "needs_input";
}

export function isStaleDraft(item: PartnerResponse): boolean {
  return Boolean(item.draft && item.draft_message_id !== item.message_id);
}
