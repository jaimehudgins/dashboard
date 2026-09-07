import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { buildDailyBrief, DailyBriefPeriod, sendDailyBrief } from "@/lib/daily-brief";
import {
  notificationStoreConfigured,
  recentNotifications,
} from "@/lib/notification-store";
import {
  isSlackInboundConfigured,
  isSlackConfigured,
  isSlackNotificationsConfigured,
} from "@/lib/slack";
import { slackInboundStoreConfigured } from "@/lib/slack-inbound";
import { sendSlackDigest } from "@/lib/slack-notifications";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const [storeConfigured, inboundStoreConfigured, notifications] = await Promise.all([
    notificationStoreConfigured(),
    slackInboundStoreConfigured(),
    recentNotifications(),
  ]);
  return NextResponse.json({
    searchConfigured: isSlackConfigured,
    notificationsConfigured: isSlackNotificationsConfigured,
    inboundConfigured: isSlackInboundConfigured,
    inboundStoreConfigured,
    storeConfigured,
    notifications,
    schedule: {
      morning: "8:00 AM Central",
      evening: "5:00 PM Central",
      urgentScan: "Every 15 minutes",
    },
  });
}

function isPeriod(value: unknown): value is DailyBriefPeriod {
  return value === "morning" || value === "evening";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isSlackNotificationsConfigured) {
    return NextResponse.json(
      { error: "Slack notifications are not configured" },
      { status: 503 },
    );
  }
  if (!(await notificationStoreConfigured())) {
    return NextResponse.json(
      { error: "Run leo-notifications.sql in dashboard Supabase first" },
      { status: 503 },
    );
  }

  try {
    if (body.action === "test") {
      const result = await sendSlackDigest({
        key: `test:${Date.now()}`,
        kind: "test",
        title: "Leo Slack connection test",
        content: `👋 *Leo is connected*\nUrgent partner alerts and the 8:00 AM / 5:00 PM Central briefings can now reach you here.`,
        metadata: { requestedBy: session.user.email },
      });
      return NextResponse.json({ ok: true, result });
    }

    if (!isPeriod(body.period)) {
      return NextResponse.json(
        { error: "period must be morning or evening" },
        { status: 400 },
      );
    }
    if (!session.accessToken || session.error === "RefreshAccessTokenError") {
      return NextResponse.json({ error: "Google is not connected" }, { status: 401 });
    }
    if (body.action === "preview") {
      const brief = await buildDailyBrief(body.period, session.accessToken);
      return NextResponse.json({ ok: true, ...brief });
    }
    if (body.action === "send") {
      const brief = await sendDailyBrief(body.period, session.accessToken);
      return NextResponse.json({ ok: true, result: brief.result });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Slack notification action failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Slack action failed" },
      { status: 500 },
    );
  }
}
