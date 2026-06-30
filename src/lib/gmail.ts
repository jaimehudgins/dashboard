// Minimal Gmail API v1 client over REST (read-only for Phase 3; drafting comes
// in Phase 4). Takes a Google access token from getGoogleAccessToken().

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailFetch(
  token: string,
  path: string,
  init?: RequestInit,
  attempt = 0,
): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  // Retry transient rate-limit / server errors with backoff.
  if ((res.status === 429 || res.status === 500 || res.status === 503) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1) * (attempt + 1)));
    return gmailFetch(token, path, init, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API ${res.status}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Run async work with bounded concurrency (Gmail has a low per-user burst cap).
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (x: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (idx < items.length) {
        const i = idx++;
        out[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

function base64url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface DraftInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  inReplyTo?: string; // Message-ID header for replies
  references?: string;
}

function buildRaw(input: DraftInput): string {
  const lines = [
    `To: ${input.to}`,
    input.cc ? `Cc: ${input.cc}` : null,
    `Subject: ${input.subject}`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    input.references ? `References: ${input.references}` : null,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    input.body,
  ].filter((l): l is string => l !== null);
  return base64url(lines.join("\r\n"));
}

// Create a Gmail draft (not sent). Returns the draft id.
export async function createDraft(
  token: string,
  input: DraftInput,
  threadId?: string,
): Promise<{ id: string }> {
  const data = await gmailFetch(token, "/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: { raw: buildRaw(input), ...(threadId ? { threadId } : {}) },
    }),
  });
  return { id: data.id };
}

// Send an email immediately. Returns the sent message id + threadId.
export async function sendEmail(
  token: string,
  input: DraftInput,
  threadId?: string,
): Promise<{ id: string; threadId: string }> {
  const data = await gmailFetch(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify({
      raw: buildRaw(input),
      ...(threadId ? { threadId } : {}),
    }),
  });
  return { id: data.id, threadId: data.threadId };
}

// Resolve reply details (recipient, subject, threading headers) from a thread.
export async function getReplyContext(
  token: string,
  threadId: string,
): Promise<{ to: string; subject: string; inReplyTo: string; references: string }> {
  const thread = await gmailFetch(
    token,
    `/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References`,
  );
  const msgs = thread.messages || [];
  const last = msgs[msgs.length - 1];
  const h = last?.payload?.headers || [];
  const subject = header(h, "Subject");
  const messageId = header(h, "Message-ID");
  const refs = header(h, "References");
  return {
    to: header(h, "From"),
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    inReplyTo: messageId,
    references: [refs, messageId].filter(Boolean).join(" "),
  };
}

// Archive a thread (remove it from the inbox).
export async function archiveThread(
  token: string,
  threadId: string,
): Promise<void> {
  await gmailFetch(token, `/threads/${threadId}/modify`, {
    method: "POST",
    body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
  });
}

function header(headers: any[], name: string): string {
  const h = (headers || []).find(
    (x) => x.name?.toLowerCase() === name.toLowerCase(),
  );
  return h?.value || "";
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
}

// Search/list messages. `query` uses Gmail search syntax (e.g. "from:sarah",
// "is:unread", "in:inbox newer_than:7d").
export async function searchMessages(
  token: string,
  query: string,
  max = 10,
): Promise<GmailMessageSummary[]> {
  const params = new URLSearchParams({
    q: query || "in:inbox",
    maxResults: String(Math.min(max, 25)),
  });
  const list = await gmailFetch(token, `/messages?${params}`);
  const ids: { id: string }[] = list.messages || [];
  const summaries = await Promise.all(
    ids.map(async (m) => {
      const msg = await gmailFetch(
        token,
        `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      const h = msg.payload?.headers || [];
      return {
        id: msg.id,
        threadId: msg.threadId,
        from: header(h, "From"),
        to: header(h, "To"),
        subject: header(h, "Subject"),
        date: header(h, "Date"),
        snippet: msg.snippet || "",
      };
    }),
  );
  return summaries;
}

function decodeData(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Decode a message body: prefer text/plain, fall back to (stripped) text/html.
function decodeBody(payload: any): string {
  let plain: string | null = null;
  let html: string | null = null;
  const walk = (p: any) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && plain === null) {
      plain = decodeData(p.body.data);
    } else if (p.mimeType === "text/html" && p.body?.data && html === null) {
      html = decodeData(p.body.data);
    }
    for (const part of p.parts || []) walk(part);
  };
  walk(payload);
  if (plain) return (plain as string).trim();
  if (html) return stripHtml(html as string);
  return "";
}

export interface GmailThreadSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  messageCount: number;
}

// List threads (one row per conversation) for an inbox view. Pass either a
// Gmail search `q` or a set of `labelIds` (AND-ed); defaults to the inbox.
export async function listThreads(
  token: string,
  opts: { q?: string; labelIds?: string[] },
  max = 25,
): Promise<GmailThreadSummary[]> {
  const params = new URLSearchParams({ maxResults: String(Math.min(max, 50)) });
  if (opts.labelIds) opts.labelIds.forEach((id) => params.append("labelIds", id));
  if (opts.q) params.set("q", opts.q);
  if (!opts.q && !opts.labelIds) params.set("q", "in:inbox");
  const list = await gmailFetch(token, `/threads?${params}`);
  const threads: { id: string; snippet?: string }[] = list.threads || [];
  return mapLimit(threads, 5, async (t) => {
      const full = await gmailFetch(
        token,
        `/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      const msgs: any[] = full.messages || [];
      const last = msgs[msgs.length - 1];
      const h = last?.payload?.headers || [];
      return {
        id: t.id,
        from: header(h, "From"),
        subject: header(h, "Subject"),
        date: header(h, "Date"),
        snippet: t.snippet || last?.snippet || "",
        unread: msgs.some((m) => (m.labelIds || []).includes("UNREAD")),
        messageCount: msgs.length,
      };
  });
}

/* ------------------------------ Labels ------------------------------ */

import { LEO_LABEL_NAMES, LeoBucket } from "./mail-views";

export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
  threadsUnread?: number;
  threadsTotal?: number;
}

export async function listLabels(token: string): Promise<GmailLabel[]> {
  const data = await gmailFetch(token, "/labels");
  return data.labels || [];
}

export async function getLabel(token: string, id: string): Promise<GmailLabel> {
  return gmailFetch(token, `/labels/${encodeURIComponent(id)}`);
}

// Ensure the Leo bucket labels exist; returns bucket -> labelId.
export async function ensureLeoLabels(
  token: string,
): Promise<Record<LeoBucket, string>> {
  const labels = await listLabels(token);
  const byName = new Map(labels.map((l) => [l.name, l.id]));
  const out = {} as Record<LeoBucket, string>;
  for (const [bucket, name] of Object.entries(LEO_LABEL_NAMES) as [
    LeoBucket,
    string,
  ][]) {
    let id = byName.get(name);
    if (!id) {
      const created = await gmailFetch(token, "/labels", {
        method: "POST",
        body: JSON.stringify({
          name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        }),
      });
      id = created.id;
    }
    out[bucket] = id!;
  }
  return out;
}

export async function modifyThreadLabels(
  token: string,
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[] = [],
): Promise<void> {
  await gmailFetch(token, `/threads/${threadId}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

// Fetch inbox threads with the metadata needed to classify them into buckets.
export interface ClassifyThread {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  labelIds: string[];
  listUnsub: boolean;
}
export async function fetchInboxForClassify(
  token: string,
  max = 40,
): Promise<ClassifyThread[]> {
  const list = await gmailFetch(
    token,
    `/threads?labelIds=INBOX&maxResults=${Math.min(max, 100)}`,
  );
  const threads: { id: string }[] = list.threads || [];
  return mapLimit(threads, 5, async (t) => {
    const full = await gmailFetch(
      token,
      `/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe`,
    );
    const msgs: any[] = full.messages || [];
    const last = msgs[msgs.length - 1];
    const h = last?.payload?.headers || [];
    const labelIds = Array.from(new Set(msgs.flatMap((m) => m.labelIds || [])));
    return {
      id: t.id,
      from: header(h, "From"),
      subject: header(h, "Subject"),
      snippet: last?.snippet || "",
      labelIds,
      listUnsub: !!header(h, "List-Unsubscribe"),
    };
  });
}

export async function getThread(
  token: string,
  threadId: string,
): Promise<{
  id: string;
  messages: {
    from: string;
    to: string;
    subject: string;
    date: string;
    snippet: string;
    body: string;
  }[];
}> {
  const thread = await gmailFetch(token, `/threads/${threadId}?format=full`);
  return {
    id: thread.id,
    messages: (thread.messages || []).map((msg: any) => {
      const h = msg.payload?.headers || [];
      return {
        from: header(h, "From"),
        to: header(h, "To"),
        subject: header(h, "Subject"),
        date: header(h, "Date"),
        snippet: msg.snippet || "",
        body: decodeBody(msg.payload).slice(0, 20000),
      };
    }),
  };
}
