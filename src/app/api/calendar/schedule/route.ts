import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  listCalendars,
  ownedCalendars,
  queryFreeBusy,
  findFreeSlots,
  CalendarApiError,
} from "@/lib/google-calendar";
import {
  parseSchedulingRequest,
  isAnthropicConfigured,
} from "@/lib/anthropic";

// POST /api/calendar/schedule  { request: string }
// Natural-language "find me a time": Claude extracts the parameters, then we
// compute open slots from owned-calendar free/busy. Propose-only — the client
// confirms before any event is created.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAnthropicConfigured) {
    return NextResponse.json(
      { error: "Natural-language scheduling isn't configured (no API key)." },
      { status: 503 },
    );
  }

  let body: { request?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = (body.request || "").trim();
  if (!text) {
    return NextResponse.json({ error: "request is required" }, { status: 400 });
  }

  try {
    const today = new Date();
    const todayISO = today.toISOString().split("T")[0];
    const parsed = await parseSchedulingRequest(text, todayISO);

    const rangeStart = new Date(`${parsed.earliestDate}T00:00:00`);
    const rangeEnd = new Date(`${parsed.latestDate}T23:59:59`);
    // Guard against a model returning a past or inverted range.
    const effectiveStart =
      rangeStart.getTime() < today.getTime() ? today : rangeStart;

    const calendars = await listCalendars(session.accessToken);
    const busy = await queryFreeBusy(
      session.accessToken,
      effectiveStart.toISOString(),
      rangeEnd.toISOString(),
      ownedCalendars(calendars).map((c) => c.id),
    );

    let slots = findFreeSlots({
      busy,
      rangeStart: effectiveStart,
      rangeEnd,
      durationMin: parsed.durationMinutes || 30,
    });

    // Honour a stated time-of-day preference.
    if (parsed.partOfDay === "morning") {
      slots = slots.filter((s) => new Date(s.start).getHours() < 12);
    } else if (parsed.partOfDay === "afternoon") {
      slots = slots.filter((s) => new Date(s.start).getHours() >= 12);
    }

    return NextResponse.json({ parsed, slots: slots.slice(0, 12) });
  } catch (err) {
    if (err instanceof CalendarApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("NL schedule error:", err);
    return NextResponse.json(
      { error: "Couldn't work out a time from that request." },
      { status: 500 },
    );
  }
}
