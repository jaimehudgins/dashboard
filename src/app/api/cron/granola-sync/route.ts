import { NextResponse } from "next/server";
import {
  syncGranola,
  backfillGranola,
  isGranolaConfigured,
} from "@/lib/granola";
import { extractPendingMeetings } from "@/lib/granola-extract";

export const maxDuration = 300;

// Scheduled Granola pull (every 15 minutes): cache new meetings + transcripts,
// then extract Jaime's commitments from any unprocessed transcript.
// Guarded by CRON_SECRET when set (Vercel sends Authorization: Bearer <secret>).
//   ?backfill=1 — one-time historical pull (context only, no extraction).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isGranolaConfigured) {
    return NextResponse.json(
      { error: "Granola not connected (missing GRANOLA_API_KEY)" },
      { status: 503 },
    );
  }
  try {
    if (new URL(req.url).searchParams.get("backfill") === "1") {
      const result = await backfillGranola();
      return NextResponse.json({ ok: true, backfill: true, ...result });
    }
    const sync = await syncGranola();
    const extract = await extractPendingMeetings();
    return NextResponse.json({ ok: true, ...sync, ...extract });
  } catch (err) {
    console.error("Granola sync error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
