import "server-only";
import { gmailProfile, isOwnReply, sentDraftPatch, threadMetadata } from "./gmail-history";
import { updateResponse } from "./partner-response-store";
import type { PartnerResponse } from "@/types/partner-response";

// Explicit, single-thread reconciliation. No sends, Gmail label writes, or
// broad rescan. The version check protects edits made while Gmail is loading.
export async function recheckReplyStatus(token: string, item: PartnerResponse) {
  const profile = await gmailProfile(token);
  if (profile.emailAddress.toLowerCase() !== (process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org").toLowerCase()) {
    throw new Error("The connected Gmail account does not match Leo's account.");
  }
  const thread = await threadMetadata(token, item.thread_id);
  if (!thread?.lastMessageId) throw new Error("No current message was found. Saved work has not been changed.");
  const ownReply = isOwnReply(thread, profile.emailAddress);
  const newMessage = thread.lastMessageId !== item.message_id;
  const retiredDraft = await sentDraftPatch(token, item, thread.lastMessageId);
  const confirmedWaiting = !newMessage && item.status === "waiting" && (
    (item.response_correction?.message_id === item.message_id && item.response_correction.decision === "waiting") ||
    (item.response_assessment?.message_id === item.message_id && item.response_assessment.decision === "waiting" && item.response_assessment.confidence === "high" && item.response_assessment.waiting_question)
  );
  const status = ownReply ? item.status === "handled" ? "handled" : confirmedWaiting ? "waiting" : "needs_input"
    : newMessage ? item.partner_id ? "needs_response" : "needs_input" : item.status;
  const updated = await updateResponse(item.thread_id, item.version, {
    ...retiredDraft,
    message_id: thread.lastMessageId, sender: thread.from, received_at: thread.date || null,
    subject: thread.subject, snippet: thread.snippet, in_inbox: thread.labelIds.includes("INBOX"),
    status,
    ...(ownReply ? { urgency: "later", confidence: "high", reason: status === "waiting" ? item.reason : status === "handled" ? "No follow-up needed unless a new incoming email arrives." : "Your reply is the latest message. Assess whether a specific unanswered question needs a partner response. Confirmed-sent drafts are kept in Previous drafts." } : newMessage ? {
      urgency: "question", confidence: "low", reason: "A newer incoming message arrived after the saved queue entry. Review it before replying.",
    } : {}),
  });
  return {
    item: updated,
    notice: (ownReply ? `Your reply is the latest message. ${status === "handled" ? "Kept as handled." : status === "waiting" ? "Kept in Waiting for the identified partner answer." : "Kept under Needs your input; assess response needs before marking Waiting."}`
      : newMessage ? "A newer incoming message needs review."
        : "Checked Gmail. Your status is unchanged.") + (retiredDraft.draft === "" ? " The sent draft was moved to Previous drafts. Assess the latest message to decide whether another reply is needed." : " Any unsent draft is unchanged."),
  };
}
