import { NextResponse } from "next/server";
import { syncGranola, isGranolaConfigured } from "@/lib/granola";

// Scheduled Granola pull (every 2 hours). Caches new meetings + transcripts.
// Guarded by CRON_SECRET when set (Vercel sends Authorization: Bearer <secret>).
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
    const result = await syncGranola();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Granola sync error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
