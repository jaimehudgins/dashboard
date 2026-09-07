import { NextResponse } from "next/server";
import { sendDailyBrief, DailyBriefPeriod } from "@/lib/daily-brief";
import { getGoogleAccessToken, isGoogleServerConfigured } from "@/lib/google-auth";
import { classifyInbox } from "@/lib/mail-classify";
import { isSlackNotificationsConfigured } from "@/lib/slack";
import { zonedParts } from "@/lib/time-zone";

export const maxDuration = 300;

function requestedPeriod(request: Request): DailyBriefPeriod | null {
  const explicit = new URL(request.url).searchParams.get("period");
  if (explicit === "morning" || explicit === "evening") return explicit;
  const local = zonedParts();
  if (local.hour === 8) return "morning";
  if (local.hour === 17) return "evening";
  return null;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isGoogleServerConfigured) {
    return NextResponse.json({ error: "Google is not connected" }, { status: 503 });
  }
  if (!isSlackNotificationsConfigured) {
    return NextResponse.json(
      { error: "Slack notifications are not configured" },
      { status: 503 },
    );
  }
  const period = requestedPeriod(request);
  if (!period) {
    return NextResponse.json({ ok: true, skipped: true, local: zonedParts() });
  }

  try {
    const token = await getGoogleAccessToken();
    await classifyInbox(token);
    const result = await sendDailyBrief(period, token);
    return NextResponse.json({
      ok: true,
      period,
      result: result.result,
      sourceErrors: result.errors,
    });
  } catch (error) {
    console.error("Daily Slack brief failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Daily brief failed" },
      { status: 500 },
    );
  }
}
