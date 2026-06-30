import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  syncGranola,
  backfillGranola,
  isGranolaConfigured,
} from "@/lib/granola";
import { extractPendingMeetings } from "@/lib/granola-extract";

export const maxDuration = 300;

// Manual Granola sync, gated by the logged-in session (not CRON_SECRET).
// Backs the "Sync now" action in the Margaret UI; also usable in the browser
// while signed in. GET and POST both sync then extract.
//   ?backfill=1 — one-time historical pull (all meetings as context, no
//   task extraction on old meetings).
async function run(req: Request) {
  if (!isGranolaConfigured) {
    return NextResponse.json(
      { error: "Granola not connected (missing GRANOLA_API_KEY)" },
      { status: 503 },
    );
  }
  const backfill = new URL(req.url).searchParams.get("backfill") === "1";
  try {
    if (backfill) {
      const result = await backfillGranola();
      return NextResponse.json({ ok: true, backfill: true, ...result });
    }
    const sync = await syncGranola();
    const extract = await extractPendingMeetings();
    return NextResponse.json({ ok: true, ...sync, ...extract });
  } catch (err) {
    console.error("Granola manual sync error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return run(req);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return run(req);
}
