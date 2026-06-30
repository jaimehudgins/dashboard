import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncGranola, isGranolaConfigured } from "@/lib/granola";

// Manual Granola sync, gated by the logged-in session (not CRON_SECRET).
// Backs the "Sync now" action in the Margaret UI; also usable in the browser
// while signed in. GET and POST both run a sync.
async function run() {
  if (!isGranolaConfigured) {
    return NextResponse.json(
      { error: "Granola not connected (missing GRANOLA_API_KEY)" },
      { status: 503 },
    );
  }
  try {
    const result = await syncGranola();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Granola manual sync error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return run();
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return run();
}
