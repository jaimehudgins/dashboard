import { NextResponse } from "next/server";
import { classifyInbox } from "@/lib/mail-classify";
import { syncPartnerMail } from "@/lib/partner-mail-sync";
import { assessPendingResponses } from "@/lib/partner-response-policy";
import { pendingPartnerAlerts, responseStoreConfigured } from "@/lib/partner-response-store";
import { getGoogleAccessToken, isGoogleServerConfigured } from "@/lib/google-auth";
import {
  sendPendingWorkbenchAlerts,
  sendUrgentPartnerEmailAlerts,
} from "@/lib/slack-notifications";

export const maxDuration = 300;

// Scheduled inbox sort. Runs headlessly with the stored Google refresh token,
// so it works with no browser session. Guarded by CRON_SECRET when set
// (Vercel sends `Authorization: Bearer <CRON_SECRET>` on scheduled runs).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isGoogleServerConfigured) {
    return NextResponse.json({ error: "Google not connected" }, { status: 503 });
  }
  try {
    const started = Date.now();
    const token = await getGoogleAccessToken();
    const result = responseStoreConfigured ? await syncPartnerMail(token) : await classifyInbox(token);
    let notificationError: string | null = null;
    let urgentAlerts = { sent: 0, duplicates: 0, disabled: true };
    let workbenchAlerts = { sent: 0, duplicates: 0, disabled: true };
    try {
      [urgentAlerts, workbenchAlerts] = await Promise.all([
        sendUrgentPartnerEmailAlerts(responseStoreConfigured ? await pendingPartnerAlerts() : result.urgentPartnerThreads),
        sendPendingWorkbenchAlerts(),
      ]);
    } catch (error) {
      notificationError =
        error instanceof Error ? error.message : "Slack notification failed";
      console.error("Cron Slack notification error:", error);
    }
    // Urgent alerts are not delayed by deeper conversation assessment. This
    // has its own lease and handles at most two messages, never drafting/sending.
    let responsePolicy: unknown = { skipped: true, reason: "Mail work used this invocation's time budget." };
    if (responseStoreConfigured && Date.now() - started < 150_000) {
      try { responsePolicy = await assessPendingResponses(token); }
      catch (error) { responsePolicy = { error: error instanceof Error ? error.message : "Response assessment failed." }; }
    }
    return NextResponse.json({
      ok: true,
      ...result,
      urgentPartnerThreads: result.urgentPartnerThreads.length,
      urgentAlerts,
      workbenchAlerts,
      notificationError,
      responsePolicy,
    });
  } catch (err) {
    console.error("Cron classify error:", err);
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }
}
