import "server-only";
import { gmailFetch, GmailApiError, getThread, type ClassifyThread } from "./gmail";
import type { PartnerResponse } from "@/types/partner-response";

// Only retire a saved draft when Gmail confirms the same text was sent AFTER
// its source message. A newer incoming reply may already follow that send.
// Whitespace differences are harmless; changed wording/signatures are not.
export async function sentDraftPatch(token: string, item: PartnerResponse, latestMessageId: string): Promise<Partial<PartnerResponse>> {
  if (!item.draft?.trim() || !item.draft_message_id) return {};
  const thread = await getThread(token, item.thread_id);
  if (thread.messages.at(-1)?.id !== latestMessageId) throw new Error("Email changed while checking the sent draft. Retry the mail check; saved text is unchanged.");
  const sourceIndex = thread.messages.findIndex((message) => message.id === item.draft_message_id);
  if (sourceIndex < 0) return {};
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const draft = normalize(item.draft);
  const sent = thread.messages.slice(sourceIndex + 1).some((message) => message.sent && message.body.length < 20_000 &&
    [message.body, message.cleanBody].some((body) => body && normalize(body) === draft));
  // The existing database trigger archives OLD.draft/sources atomically with
  // this clear. Optimistic versions protect edits made during Gmail lookup.
  return sent ? { draft: "", draft_message_id: null, draft_sources: [] } : {};
}

interface MessageRef { id: string; threadId: string }
export interface GmailHistoryPage {
  historyId: string;
  nextPageToken?: string;
  history?: {
    id: string;
    messages?: MessageRef[];
    messagesAdded?: { message: MessageRef }[];
    messagesDeleted?: { message: MessageRef }[];
    labelsAdded?: { message: MessageRef }[];
    labelsRemoved?: { message: MessageRef }[];
  }[];
}

export function changedThreadIds(page: GmailHistoryPage): string[] {
  return [...new Set((page.history ?? []).flatMap((record) => [
    ...(record.messages ?? []),
    ...(record.messagesAdded ?? []).map((entry) => entry.message),
    ...(record.messagesDeleted ?? []).map((entry) => entry.message),
    ...(record.labelsAdded ?? []).map((entry) => entry.message),
    ...(record.labelsRemoved ?? []).map((entry) => entry.message),
  ].map((message) => message.threadId).filter(Boolean)))];
}

export async function gmailProfile(token: string): Promise<{ emailAddress: string; historyId: string }> {
  return gmailFetch(token, "/profile");
}

export async function gmailHistory(token: string, historyId: string, pageToken?: string | null): Promise<GmailHistoryPage> {
  const params = new URLSearchParams({ startHistoryId: historyId, maxResults: "50" });
  if (pageToken) params.set("pageToken", pageToken);
  // Do not filter by INBOX: sent replies, removals, and archived threads matter.
  return gmailFetch(token, `/history?${params}`);
}

export async function initialThreadIds(token: string): Promise<string[]> {
  const page: { threads?: { id: string }[] } = await gmailFetch(token, "/threads?labelIds=INBOX&maxResults=100");
  return (page.threads ?? []).map((thread) => thread.id);
}

export async function recoveryThreadIds(token: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  const started = Date.now();
  do {
    if (Date.now() - started > 60_000) throw new Error("Inbox recovery listing timed out. The saved mail cursor has not advanced; retry the check.");
    const params = new URLSearchParams({ labelIds: "INBOX", maxResults: "500" });
    if (pageToken) params.set("pageToken", pageToken);
    const page: { threads?: { id: string }[]; nextPageToken?: string } = await gmailFetch(token, `/threads?${params}`);
    ids.push(...(page.threads ?? []).map((thread) => thread.id));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return [...new Set(ids)];
}

interface Header { name: string; value: string }
interface MetadataThread {
  id: string;
  messages?: { id: string; internalDate: string; labelIds?: string[]; snippet?: string; payload?: { headers?: Header[] } }[];
}

export function classifyMetadata(thread: MetadataThread): ClassifyThread {
  const messages = (thread.messages ?? []).filter((message) => !message.labelIds?.some((label) => ["DRAFT", "TRASH", "SPAM"].includes(label)))
    .sort((left, right) => Number(left.internalDate) - Number(right.internalDate));
  const last = messages.at(-1);
  const header = (headers: Header[], name: string) => headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const headers = last?.payload?.headers ?? [];
  const received = Number(last?.internalDate);
  return {
    id: thread.id,
    lastMessageId: last?.id ?? "",
    // Only the latest message counts. A thread-level SENT union can refer to
    // an old reply that a partner has since answered.
    lastMessageSent: last?.labelIds?.includes("SENT") ?? false,
    from: header(headers, "From"),
    subject: header(headers, "Subject"),
    date: received && Number.isFinite(received) ? new Date(received).toISOString() : "",
    snippet: last?.snippet ?? "",
    participants: [...new Set(messages.flatMap((message) => ["From", "To", "Cc"].flatMap((name) =>
      header(message.payload?.headers ?? [], name).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [],
    )).map((address) => address.toLowerCase()))],
    labelIds: [...new Set(messages.flatMap((message) => message.labelIds ?? []))],
    unread: last?.labelIds?.includes("UNREAD") ?? false,
    listUnsub: Boolean(header(headers, "List-Unsubscribe")),
  };
}

export function isOwnReply(thread: Pick<ClassifyThread, "from" | "lastMessageSent">, accountEmail: string): boolean {
  const sender = thread.from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
  return thread.lastMessageSent === true || sender === accountEmail.toLowerCase();
}

export async function threadMetadata(token: string, id: string): Promise<ClassifyThread | null> {
  try {
    const full: MetadataThread = await gmailFetch(token, `/threads/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe`);
    return classifyMetadata(full);
  } catch (error) {
    if (error instanceof GmailApiError && error.status === 404) return null;
    throw error;
  }
}
