import { createHmac, timingSafeEqual } from "node:crypto";
import { runLeoAgent, type LeoAgentMessage } from "./leo-agent";
import {
  postSlackMessage,
  slackSigningSecret,
  updateSlackMessage,
} from "./slack";
import { supabase } from "./supabase";

interface SlackRequestRow {
  request_text: string;
  response_text: string | null;
}

export async function slackInboundStoreConfigured(): Promise<boolean> {
  const { error } = await supabase
    .from("leo_slack_requests")
    .select("event_id", { head: true, count: "exact" })
    .limit(1);
  return !error;
}

export function verifySlackSignature(input: {
  body: string;
  timestamp: string | null;
  signature: string | null;
}): boolean {
  if (!slackSigningSecret || !input.timestamp || !input.signature) return false;
  const sentAt = Number(input.timestamp);
  if (!Number.isFinite(sentAt)) return false;
  if (Math.abs(Date.now() / 1000 - sentAt) > 5 * 60) return false;

  const expected = `v0=${createHmac("sha256", slackSigningSecret)
    .update(`v0:${input.timestamp}:${input.body}`)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(input.signature);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

async function claimRequest(input: {
  eventId: string;
  userId: string;
  channel: string;
  messageTs: string;
  text: string;
}): Promise<boolean> {
  const { error } = await supabase.from("leo_slack_requests").insert({
    event_id: input.eventId,
    slack_user_id: input.userId,
    slack_channel: input.channel,
    message_ts: input.messageTs,
    request_text: input.text,
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  if (error.message.includes("leo_slack_requests")) {
    throw new Error("Slack inbound needs the leo-slack-inbound.sql migration.");
  }
  throw error;
}

async function conversationHistory(
  channel: string,
  currentEventId: string,
): Promise<LeoAgentMessage[]> {
  const { data, error } = await supabase
    .from("leo_slack_requests")
    .select("request_text, response_text")
    .eq("slack_channel", channel)
    .eq("status", "processed")
    .neq("event_id", currentEventId)
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) throw error;

  return ((data ?? []) as SlackRequestRow[])
    .reverse()
    .flatMap((row) => {
      const messages: LeoAgentMessage[] = [
        { role: "user", content: row.request_text },
      ];
      if (row.response_text) {
        messages.push({ role: "assistant", content: row.response_text });
      }
      return messages;
    });
}

async function finishRequest(
  eventId: string,
  input: {
    response: string;
    responseSlackTs: string;
    toolsUsed: string[];
  },
): Promise<void> {
  const { error } = await supabase
    .from("leo_slack_requests")
    .update({
      response_text: input.response,
      response_slack_ts: input.responseSlackTs,
      tools_used: input.toolsUsed,
      status: "processed",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
  if (error) throw error;
}

async function failRequest(eventId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Slack request failed";
  await supabase
    .from("leo_slack_requests")
    .update({
      status: "failed",
      error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
}

export async function processSlackDirectMessage(input: {
  eventId: string;
  userId: string;
  channel: string;
  messageTs: string;
  text: string;
  base: string;
}): Promise<void> {
  const claimed = await claimRequest(input);
  if (!claimed) return;

  let placeholderTs: string | null = null;
  try {
    const placeholder = await postSlackMessage(
      input.channel,
      ":hourglass_flowing_sand: Leo is looking into that…",
    );
    placeholderTs = placeholder.ts;
    const history = await conversationHistory(input.channel, input.eventId);
    const result = await runLeoAgent({
      base: input.base,
      token: process.env.MCP_TOKEN?.trim(),
      name: "Jaime",
      messages: [...history, { role: "user", content: input.text }],
      surface: "slack",
    });
    await updateSlackMessage(input.channel, placeholder.ts, result.reply);
    await finishRequest(input.eventId, {
      response: result.reply,
      responseSlackTs: placeholder.ts,
      toolsUsed: result.toolsUsed,
    });
  } catch (error) {
    await failRequest(input.eventId, error);
    if (placeholderTs) {
      await updateSlackMessage(
        input.channel,
        placeholderTs,
        "I hit a snag while working on that. Please try again, or open Leo for more detail.",
      ).catch(() => undefined);
    }
    throw error;
  }
}
