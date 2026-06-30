import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureLeoLabels, getLabel } from "@/lib/gmail";
import { VIEWS, LeoBucket } from "@/lib/mail-views";

// GET /api/mail/views — returns the view list with unread counts.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const token = session.accessToken;
  try {
    const leo = await ensureLeoLabels(token);
    const inbox = await getLabel(token, "INBOX");
    const counts: Record<string, number> = {};
    let labeledUnread = 0;
    for (const bucket of Object.keys(leo) as LeoBucket[]) {
      const lbl = await getLabel(token, leo[bucket]);
      counts[bucket] = lbl.threadsUnread || 0;
      labeledUnread += counts[bucket];
    }
    counts.all = inbox.threadsUnread || 0;
    // Approximate: inbox unread not in any Leo bucket.
    counts.other = Math.max(0, (inbox.threadsUnread || 0) - labeledUnread);

    return NextResponse.json({
      views: VIEWS.map((v) => ({ ...v, unread: counts[v.key] || 0 })),
    });
  } catch (err) {
    console.error("Mail views error:", err);
    return NextResponse.json({ error: "Failed to load views" }, { status: 500 });
  }
}
