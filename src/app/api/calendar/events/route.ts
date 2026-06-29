import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listAllEvents, CalendarApiError } from "@/lib/google-calendar";

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
