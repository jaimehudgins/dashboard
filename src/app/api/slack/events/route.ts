import { after, NextResponse } from "next/server";
import {
  isSlackInboundConfigured,
  slackAlertUserId,
} from "@/lib/slack";
import {
  processSlackDirectMessage,
  verifySlackSignature,
} from "@/lib/slack-inbound";

export const runtime = "nodejs";
export const maxDuration = 300;

interface SlackEventPayload {
  type?: string;
  challenge?: string;
  event_id?: string;
  event?: {
    type?: string;
    subtype?: string;
    bot_id?: string;
    user?: string;
    channel?: string;
    channel_type?: string;
    text?: string;
    ts?: string;
  };
}

export async function POST(request: Request) {
  if (!isSlackInboundConfigured) {
    return NextResponse.json(
      { error: "Slack inbound is not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const verified = verifySlackSignature({
    body: rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
  }

  let body: SlackEventPayload;
  try {
    body = JSON.parse(rawBody) as SlackEventPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.type === "url_verification" && body.challenge) {
    return NextResponse.json({ challenge: body.challenge });
  }

  const event = body.event;
  const isAllowedDirectMessage =
    body.type === "event_callback" &&
    !!body.event_id &&
    event?.type === "message" &&
    event.channel_type === "im" &&
    !event.subtype &&
    !event.bot_id &&
    event.user === slackAlertUserId &&
    !!event.channel &&
    !!event.ts &&
    !!event.text?.trim();
  if (!isAllowedDirectMessage || !body.event_id || !event) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const base = new URL(request.url).origin;
  after(async () => {
    try {
      await processSlackDirectMessage({
        eventId: body.event_id as string,
        userId: event.user as string,
        channel: event.channel as string,
        messageTs: event.ts as string,
        text: event.text!.trim(),
        base,
      });
    } catch (error) {
      console.error("Slack inbound request failed:", error);
    }
  });

  return NextResponse.json({ ok: true });
}
