import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchSlack, isSlackConfigured } from "@/lib/slack";

// GET /api/slack/search?q=...
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isSlackConfigured) {
    return NextResponse.json({ configured: false, hits: [] });
  }
  const q = new URL(req.url).searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ configured: true, hits: [] });
  try {
    const hits = await searchSlack(q, 25);
    return NextResponse.json({ configured: true, hits });
  } catch (err) {
    console.error("Slack search error:", err);
    return NextResponse.json(
      { configured: true, error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 },
    );
  }
}
