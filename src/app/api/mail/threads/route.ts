import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listThreads, ensureLeoLabels } from "@/lib/gmail";
import { LEO_LABEL_NAMES, LeoBucket } from "@/lib/mail-views";
import {
  fetchUrgency,
  classifyUrgency,
  saveUrgency,
} from "@/lib/mail-urgency";
import type { GmailThreadSummary } from "@/lib/gmail";

async function withUrgency(threads: GmailThreadSummary[]) {
  const urgency = await fetchUrgency(threads.map((t) => t.id));
  // Lazily rate any displayed thread that hasn't been classified yet, so every
  // view (not just the recently-sorted inbox window) shows the glyph.
  const missing = threads.filter((t) => !urgency[t.id]);
  if (missing.length > 0) {
    const judged = await classifyUrgency(
      missing.map((t) => ({
        id: t.id,
        from: t.from,
        subject: t.subject,
        snippet: t.snippet,
      })),
    );
    if (judged.size > 0) {
      await saveUrgency(judged);
      for (const [id, u] of judged) urgency[id] = u;
    }
  }
  return threads.map((t) => ({ ...t, urgency: urgency[t.id] || null }));
}

// GET /api/mail/threads?view=all|current|potential|newsletter|willow|other&q=
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const token = session.accessToken;
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const view = params.get("view") || "all";

  try {
    // Free-text search overrides the view.
    if (q) {
      const threads = await listThreads(token, { q }, 25);
      return NextResponse.json({ threads: await withUrgency(threads) });
    }

    if (view === "all") {
      const threads = await listThreads(token, { labelIds: ["INBOX"] }, 25);
      return NextResponse.json({ threads: await withUrgency(threads) });
    }

    const leo = await ensureLeoLabels(token);

    if (view === "other") {
      // Inbox threads with none of the Leo labels.
      const names = Object.values(LEO_LABEL_NAMES)
        .map((n) => `-label:"${n}"`)
        .join(" ");
      const threads = await listThreads(token, { q: `in:inbox ${names}` }, 25);
      return NextResponse.json({ threads: await withUrgency(threads) });
    }

    const labelId = leo[view as LeoBucket];
    if (!labelId) {
      return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }
    const threads = await listThreads(
      token,
      { labelIds: ["INBOX", labelId] },
      25,
    );
    return NextResponse.json({ threads: await withUrgency(threads) });
  } catch (err) {
    console.error("Mail threads error:", err);
    return NextResponse.json({ error: "Failed to load mail" }, { status: 500 });
  }
}
