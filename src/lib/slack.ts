// Slack search uses a user token because Slack does not grant search:read to bot
// tokens. Notifications use a bot token with chat:write and im:write. Keep the
// legacy SLACK_TOKEN fallback so existing search setups continue to work.

const SEARCH_TOKEN =
  process.env.SLACK_SEARCH_TOKEN?.trim() || process.env.SLACK_TOKEN?.trim();
const BOT_TOKEN =
  process.env.SLACK_BOT_TOKEN?.trim() || process.env.SLACK_TOKEN?.trim();
const ALERT_USER_ID = process.env.SLACK_ALERT_USER_ID?.trim();
const ALERT_CHANNEL_ID = process.env.SLACK_ALERT_CHANNEL_ID?.trim();
export const slackAlertUserId = ALERT_USER_ID;
export const slackSigningSecret = process.env.SLACK_SIGNING_SECRET?.trim();

export const isSlackConfigured = !!SEARCH_TOKEN;
export const isSlackNotificationsConfigured =
  !!BOT_TOKEN && !!(ALERT_USER_ID || ALERT_CHANNEL_ID);
export const isSlackInboundConfigured =
  !!BOT_TOKEN && !!ALERT_USER_ID && !!slackSigningSecret;

interface SlackApiResponse {
  ok: boolean;
  error?: string;
}

async function slackFetch<T extends SlackApiResponse>(
  method: string,
  params: Record<string, string>,
  token: string | undefined,
): Promise<T> {
  if (!token) throw new Error(`Slack ${method}: token is not configured`);
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Slack ${method}: HTTP ${res.status}`);
  const data = (await res.json()) as T;
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error}`);
  return data;
}

export interface SlackHit {
  text: string;
  user: string;
  channel: string;
  ts: string;
  permalink: string;
}

export async function searchSlack(
  query: string,
  count = 20,
): Promise<SlackHit[]> {
  const data = await slackFetch<
    SlackApiResponse & {
      messages?: {
        matches?: Array<{
          text?: string;
          username?: string;
          user?: string;
          channel?: { name?: string };
          ts?: string;
          permalink?: string;
        }>;
      };
    }
  >(
    "search.messages",
    {
      query,
      count: String(Math.min(count, 50)),
      sort: "timestamp",
    },
    SEARCH_TOKEN,
  );
  return (data.messages?.matches || []).map((m) => ({
    text: m.text || "",
    user: m.username || m.user || "",
    channel: m.channel?.name || "",
    ts: m.ts || "",
    permalink: m.permalink || "",
  }));
}

export async function slackAuthTest(): Promise<{ team?: string; user?: string }> {
  return slackFetch<SlackApiResponse & { team?: string; user?: string }>(
    "auth.test",
    {},
    SEARCH_TOKEN,
  );
}

export interface SlackNotificationResult {
  channel: string;
  ts: string;
}

let cachedAlertChannel: string | null = null;

async function notificationChannel(): Promise<string> {
  if (ALERT_CHANNEL_ID) return ALERT_CHANNEL_ID;
  if (cachedAlertChannel) return cachedAlertChannel;
  if (!ALERT_USER_ID) {
    throw new Error("SLACK_ALERT_USER_ID or SLACK_ALERT_CHANNEL_ID is required");
  }
  const opened = await slackFetch<
    SlackApiResponse & { channel?: { id?: string } }
  >(
    "conversations.open",
    { users: ALERT_USER_ID, return_im: "true" },
    BOT_TOKEN,
  );
  const channel = opened.channel?.id as string | undefined;
  if (!channel) throw new Error("Slack conversations.open returned no channel");
  cachedAlertChannel = channel;
  return channel;
}

export async function postSlackNotification(
  text: string,
): Promise<SlackNotificationResult> {
  if (!isSlackNotificationsConfigured) {
    throw new Error("Slack notifications are not configured");
  }
  const channel = await notificationChannel();
  return postSlackMessage(channel, text);
}

export async function postSlackMessage(
  channel: string,
  text: string,
): Promise<SlackNotificationResult> {
  const posted = await slackFetch<
    SlackApiResponse & { channel: string; ts: string }
  >(
    "chat.postMessage",
    {
      channel,
      text: text.slice(0, 39_000),
      mrkdwn: "true",
      unfurl_links: "false",
      unfurl_media: "false",
    },
    BOT_TOKEN,
  );
  return { channel: posted.channel, ts: posted.ts };
}

export async function updateSlackMessage(
  channel: string,
  ts: string,
  text: string,
): Promise<void> {
  await slackFetch<SlackApiResponse>(
    "chat.update",
    {
      channel,
      ts,
      text: text.slice(0, 39_000),
      mrkdwn: "true",
    },
    BOT_TOKEN,
  );
}

export async function slackNotificationAuthTest(): Promise<{
  team?: string;
  user?: string;
}> {
  return slackFetch<SlackApiResponse & { team?: string; user?: string }>(
    "auth.test",
    {},
    BOT_TOKEN,
  );
}

// Mentions always acknowledge privately, even if alerts use a shared channel.
export async function openSlackOwnerDm(): Promise<string> {
  if (!ALERT_USER_ID) throw new Error("SLACK_ALERT_USER_ID is required");
  const opened = await slackFetch<SlackApiResponse & { channel?: { id?: string } }>(
    "conversations.open", { users: ALERT_USER_ID, return_im: "true" }, BOT_TOKEN,
  );
  if (!opened.channel?.id?.startsWith("D")) throw new Error("Slack did not return a private direct message");
  return opened.channel.id;
}

export interface SlackThreadMessage { ts: string; user?: string; text: string; thread_ts?: string }
export async function readSlackMentionThread(channel: string, rootTs: string, mentionTs: string) {
  if (!/^[CG][A-Z0-9]+$/.test(channel) || !/^\d+\.\d+$/.test(rootTs) || !/^\d+\.\d+$/.test(mentionTs)) throw new Error("Invalid Slack thread reference");
  const messages: SlackThreadMessage[] = [];
  let cursor = "";
  for (let page = 0; page < 3; page++) {
    const data = await slackFetch<SlackApiResponse & { messages?: SlackThreadMessage[]; has_more?: boolean; response_metadata?: { next_cursor?: string } }>(
      "conversations.replies", { channel, ts: rootTs, latest: mentionTs, inclusive: "true", limit: "50", ...(cursor ? { cursor } : {}) }, BOT_TOKEN,
    );
    for (const message of data.messages ?? []) {
      if (typeof message.ts !== "string" || typeof message.text !== "string" || !/^\d+\.\d+$/.test(message.ts)) throw new Error("Slack returned incomplete thread content");
      if (Number(message.ts) <= Number(mentionTs) && !messages.some((old) => old.ts === message.ts)) messages.push(message);
    }
    if (messages.length > 100 || messages.reduce((size, message) => size + message.text.length, 0) > 30_000) throw new Error("This thread is too long. Quote the specific message in a shorter thread and mention Leo there.");
    cursor = data.response_metadata?.next_cursor?.trim() || "";
    if (!cursor && !data.has_more) {
      if (!messages.some((message) => message.ts === rootTs) || !messages.some((message) => message.ts === mentionTs)) throw new Error("Slack did not return the complete thread through your mention");
      const link = await slackFetch<SlackApiResponse & { permalink?: string }>("chat.getPermalink", { conversation_id: channel, message_ts: mentionTs }, BOT_TOKEN);
      const url = new URL(link.permalink || "");
      if (url.protocol !== "https:" || !url.hostname.endsWith(".slack.com")) throw new Error("Slack did not return a valid source link");
      return { messages: messages.sort((a, b) => Number(a.ts) - Number(b.ts)), permalink: url.toString() };
    }
    if (!cursor) break;
  }
  throw new Error("Leo could not read the full Slack thread. Quote the relevant message in a shorter thread.");
}
