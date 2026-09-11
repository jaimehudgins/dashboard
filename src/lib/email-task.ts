import type { PartnerResponse } from "@/types/partner-response";

export interface EmailTaskSummary {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  link: string | null;
  description: string | null;
}
export interface EmailTaskPreview {
  messageId: string;
  title: string;
  notes: string;
  links: string[];
}
export function normalizedTaskTitle(title: string): string {
  return title.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}
export function emailTaskLink(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}
export function taskBelongsToThread(task: Pick<EmailTaskSummary, "link" | "description">, threadId: string): boolean {
  const text = `${task.link ?? ""}\n${task.description ?? ""}`;
  // Require a delimited ID; do not match another thread with this ID as a prefix.
  return new RegExp(`(?:[/=]|gmail-thread:)${threadId}(?=$|[\\s&#)\\]}>])`).test(text);
}
export function emailTaskPreview(item: PartnerResponse, messages: { id: string; from: string; date: string; cleanBody: string; body: string }[]): EmailTaskPreview {
  const latest = messages.at(-1);
  if (!latest) throw new Error("No readable email was found. No task was created.");
  const assessment = item.response_assessment?.message_id === latest.id ? item.response_assessment : null;
  const correction = item.response_correction?.message_id === latest.id ? item.response_correction : null;
  const action = correction?.reason || assessment?.reason;
  const links = [...new Set(messages.flatMap((message) => (message.cleanBody || message.body).match(/https?:\/\/[^\s<>"\]]+/g) ?? [])
    .map((url) => url.replace(/[.,;!?)}]+$/, "")))].slice(0, 50);
  return {
    messageId: latest.id,
    title: (action || `Follow up: ${item.subject}`).slice(0, 240),
    notes: [item.partner_name && `Partner: ${item.partner_name}`, `Subject: ${item.subject}`, `From: ${latest.from}`, `Date: ${latest.date}`,
      action && `Leo's assessment (review before creating): ${action}`,
      `Email excerpt${(latest.cleanBody || latest.body).length > 6000 ? " (first 6,000 characters)" : ""}:\n${(latest.cleanBody || latest.body).slice(0, 6000)}`].filter(Boolean).join("\n\n"),
    links,
  };
}
