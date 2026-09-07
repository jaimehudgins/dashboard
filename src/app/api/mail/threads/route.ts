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
import { crmSupabase, isCrmConfigured } from "@/lib/crm-supabase";

type TemuTouchpointRow = {
  source_external_id: string;
  source_created_at: string | null;
};

async function withTemuStatus<T extends GmailThreadSummary>(threads: T[]) {
  if (!isCrmConfigured || threads.length === 0) return threads;
  const sourceIds = threads.map((thread) => `gmail-thread:${thread.id}`);
  const { data, error } = await crmSupabase
    .from("touchpoints")
    .select("source_external_id, source_created_at")
    .eq("source_system", "leo:temu")
    .in("source_external_id", sourceIds);
  if (error) {
    console.warn("Could not load TEMU email indicators", error.message);
    return threads;
  }
  const bySourceId = new Map(
    ((data ?? []) as TemuTouchpointRow[]).map((touchpoint) => [
      touchpoint.source_external_id,
      touchpoint,
    ]),
  );
  return threads.map((thread) => {
    const touchpoint = bySourceId.get(`gmail-thread:${thread.id}`);
    if (!touchpoint) return thread;
    const latestDate = new Date(thread.date);
    const syncedThrough = touchpoint.source_created_at
      ? new Date(touchpoint.source_created_at)
      : null;
    return {
      ...thread,
      temuStatus: {
        hasNewMessages:
          !Number.isNaN(latestDate.valueOf()) &&
          (!syncedThrough ||
            Number.isNaN(syncedThrough.valueOf()) ||
            latestDate > syncedThrough),
      },
    };
  });
}

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
  return withTemuStatus(
    threads.map((t) => ({ ...t, urgency: urgency[t.id] || null })),
  );
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
