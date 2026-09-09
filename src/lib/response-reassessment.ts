import "server-only";
import { getResponse, updateResponse } from "./partner-response-store";
import { gmailProfile, isOwnReply, threadMetadata } from "./gmail-history";
import { previewResponseAssessment } from "./partner-response-policy";
import { assessedResponseStatus } from "./response-needed-policy";
import { reassessmentStatuses, type ReassessmentScope, type ReassessmentResult, type ReassessmentTarget } from "@/types/response-reassessment";

async function verifyAccount(token: string) {
  const profile = await gmailProfile(token);
  if (profile.emailAddress.toLowerCase() !== (process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org").toLowerCase()) {
    throw new Error("The connected Gmail account does not match Leo's account.");
  }
  return profile.emailAddress;
}

export async function reassessConversation(token: string, target: ReassessmentTarget, runId: string, scope: ReassessmentScope): Promise<ReassessmentResult> {
  const item = await getResponse(target.threadId);
  if (!item || item.version !== target.version || !reassessmentStatuses(scope).includes(item.status)) throw new Error("This conversation changed or is outside the selected scope. Reload it for a fresh review.");
  const email = await verifyAccount(token);
  const current = await threadMetadata(token, item.thread_id);
  if (!current?.lastMessageId || current.labelIds.some((label) => ["TRASH", "SPAM"].includes(label))) throw new Error("This conversation is unavailable or in trash/spam. Review it in Mail.");
  const changedMessage = current.lastMessageId !== item.message_id;
  const snapshot = { ...item, message_id: current.lastMessageId };
  // Assessment uses the full latest conversation and current rules, even when
  // an assessment for the old message was already saved. No intermediate write.
  const { assessment, latest } = await previewResponseAssessment(token, snapshot);
  const ownReply = isOwnReply(latest, email);
  // Handled is itself a human closure, including older status-only closures.
  // Only genuinely new incoming mail can reopen it, as in normal mail sync.
  const protectedDecision = item.response_correction?.message_id === latest.lastMessageId ||
    (item.status === "handled" && (!changedMessage || ownReply));
  // A new partner email invalidates the old Waiting state. Never use an old
  // active draft as evidence that a reply to this new message is ready.
  const status = protectedDecision ? item.status : assessedResponseStatus({
    ...snapshot, status: item.status === "waiting" || item.status === "handled" ? "needs_input" : item.status,
    ...(item.draft_message_id !== latest.lastMessageId ? { draft: "" } : {}),
  }, assessment, ownReply);
  const saved = await updateResponse(item.thread_id, item.version, {
    message_id: latest.lastMessageId, sender: latest.from, subject: latest.subject,
    snippet: latest.snippet, received_at: latest.date || null,
    in_inbox: latest.labelIds.includes("INBOX"), status,
    reason: protectedDecision ? item.reason : assessment.reason,
    response_assessment: { ...assessment, bulk_run_id: runId }, response_assessment_retry_at: null,
  });
  return {
    threadId: saved.thread_id, version: saved.version, messageId: saved.message_id,
    subject: saved.subject, partner: saved.partner_name, status: saved.status,
    decision: assessment.decision, reason: assessment.reason, protectedDecision,
    canClose: !protectedDecision && assessment.decision === "no_reply" && assessment.confidence === "high" && saved.status === "needs_input",
  };
}

export async function approveReassessedClosure(token: string, target: ReassessmentTarget & { messageId: string }, runId: string) {
  const item = await getResponse(target.threadId);
  const assessment = item?.response_assessment;
  if (!item || item.version !== target.version || item.message_id !== target.messageId || item.status !== "needs_input" ||
    assessment?.message_id !== item.message_id || assessment.bulk_run_id !== runId || assessment.decision !== "no_reply" || assessment.confidence !== "high" ||
    item.response_correction?.message_id === item.message_id) {
    throw new Error("This reviewed suggestion changed or has a saved human decision. Reassess before closing it.");
  }
  await verifyAccount(token);
  const latest = await threadMetadata(token, item.thread_id);
  if (!latest?.lastMessageId || latest.lastMessageId !== item.message_id) throw new Error("New email activity was found. Reassess this conversation before closing it.");
  // One explicit approval per current version. No Gmail, task, draft, or CRM
  // mutation. A later incoming message reopens the conversation through sync.
  await updateResponse(item.thread_id, item.version, {
    status: "handled", follow_up_on: null,
    response_correction: { message_id: item.message_id, decision: "no_reply", reason: "Approved no follow-up needed after bulk reassessment.", corrected_at: new Date().toISOString() },
  });
}
