import { NextResponse } from "next/server";

// Placeholder cron target. Later phases drop real jobs into /api/cron/*.
// Vercel sends `Authorization: Bearer <CRON_SECRET>` on scheduled invocations
// when CRON_SECRET is configured; the guard is a no-op until then.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
