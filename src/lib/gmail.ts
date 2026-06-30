// Minimal Gmail API v1 client over REST (read-only for Phase 3; drafting comes
// in Phase 4). Takes a Google access token from getGoogleAccessToken().

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API ${res.status}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
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

function decodeBody(payload: any): string {
  // Prefer text/plain; walk parts recursively.
  const walk = (p: any): string | null => {
    if (!p) return null;
    if (p.mimeType === "text/plain" && p.body?.data) {
      return Buffer.from(p.body.data, "base64").toString("utf8");
    }
    for (const part of p.parts || []) {
      const found = walk(part);
      if (found) return found;
    }
    return null;
  };
  return (walk(payload) || "").trim();
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

// List threads (one row per conversation) for an inbox view. `query` uses
// Gmail search syntax; defaults to the inbox.
export async function listThreads(
  token: string,
  query: string,
  max = 25,
): Promise<GmailThreadSummary[]> {
  const params = new URLSearchParams({
    q: query || "in:inbox",
    maxResults: String(Math.min(max, 50)),
  });
  const list = await gmailFetch(token, `/threads?${params}`);
  const threads: { id: string; snippet?: string }[] = list.threads || [];
  return Promise.all(
    threads.map(async (t) => {
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
    }),
  );
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
        body: decodeBody(msg.payload).slice(0, 4000),
      };
    }),
  };
}
