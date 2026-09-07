// Slack search uses a user token because Slack does not grant search:read to bot
// tokens. Notifications use a bot token with chat:write and im:write. Keep the
// legacy SLACK_TOKEN fallback so existing search setups continue to work.

const SEARCH_TOKEN =
  process.env.SLACK_SEARCH_TOKEN?.trim() || process.env.SLACK_TOKEN?.trim();
const BOT_TOKEN =
  process.env.SLACK_BOT_TOKEN?.trim() || process.env.SLACK_TOKEN?.trim();
const ALERT_USER_ID = process.env.SLACK_ALERT_USER_ID?.trim();
const ALERT_CHANNEL_ID = process.env.SLACK_ALERT_CHANNEL_ID?.trim();

export const isSlackConfigured = !!SEARCH_TOKEN;
export const isSlackNotificationsConfigured =
  !!BOT_TOKEN && !!(ALERT_USER_ID || ALERT_CHANNEL_ID);

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
  });
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
