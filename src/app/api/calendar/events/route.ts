import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  listAllEvents,
  createEvent,
  CalendarApiError,
  EventInput,
} from "@/lib/google-calendar";

async function requireToken() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return null;
  }
  return session.accessToken;
}

// GET /api/calendar/events?start=<ISO>&end=<ISO>
// Returns events across all of the user's calendars in the given window.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json(
      { error: "Session expired — please sign in again" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query params are required" },
      { status: 400 },
    );
  }

  try {
    const { events, calendars } = await listAllEvents(
      session.accessToken,
      start,
      end,
    );
    return NextResponse.json({ events, calendars });
  } catch (err) {
    if (err instanceof CalendarApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Calendar events error:", err);
    return NextResponse.json(
      { error: "Failed to load calendar events" },
      { status: 500 },
    );
  }
}

// POST /api/calendar/events — create an event (calendarId in the body).
export async function POST(req: Request) {
  const token = await requireToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let input: EventInput;
  try {
    input = (await req.json()) as EventInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!input.calendarId || !input.title || !input.start || !input.end) {
    return NextResponse.json(
      { error: "calendarId, title, start and end are required" },
      { status: 400 },
    );
  }
  try {
    const created = await createEvent(token, input);
    return NextResponse.json({ event: created });
  } catch (err) {
    if (err instanceof CalendarApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Create event error:", err);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 },
    );
  }
}
