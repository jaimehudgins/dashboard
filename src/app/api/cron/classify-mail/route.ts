import { NextResponse } from "next/server";
import { classifyInbox } from "@/lib/mail-classify";
import { getGoogleAccessToken, isGoogleServerConfigured } from "@/lib/google-auth";

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
    const token = await getGoogleAccessToken();
    const result = await classifyInbox(token);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Cron classify error:", err);
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }
}
