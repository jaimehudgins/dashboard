// Minimal Gmail API v1 client over REST (read-only for Phase 3; drafting comes
// in Phase 4). Takes a Google access token from getGoogleAccessToken().

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailFetch(token: string, path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
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
