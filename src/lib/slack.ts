// Minimal Slack Web API client. Activates when SLACK_TOKEN is set (a user token,
// xoxp-, with search:read for search; or a bot token for posting). v1 focuses on
// search across the workspace; triage + drafting can layer on later.

const TOKEN = process.env.SLACK_TOKEN?.trim();
export const isSlackConfigured = !!TOKEN;

async function slackFetch(
  method: string,
  params: Record<string, string>,
): Promise<any> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
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
  const data = await slackFetch("search.messages", {
    query,
    count: String(Math.min(count, 50)),
    sort: "timestamp",
  });
  return (data.messages?.matches || []).map((m: any) => ({
    text: m.text || "",
    user: m.username || m.user || "",
    channel: m.channel?.name || "",
    ts: m.ts || "",
    permalink: m.permalink || "",
  }));
}

export async function slackAuthTest(): Promise<{ team?: string; user?: string }> {
  return slackFetch("auth.test", {});
}
