import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  listCalendars,
  queryFreeBusy,
  findFreeSlots,
  CalendarApiError,
} from "@/lib/google-calendar";

// GET /api/calendar/freebusy?start=<ISO>&end=<ISO>&duration=<min>
// Returns open slots of the requested length within working hours.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const duration = parseInt(searchParams.get("duration") || "30", 10);
  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query params are required" },
      { status: 400 },
    );
  }

  try {
    const calendars = await listCalendars(session.accessToken);
    const busy = await queryFreeBusy(
      session.accessToken,
      start,
      end,
      calendars.map((c) => c.id),
    );
    const slots = findFreeSlots({
      busy,
      rangeStart: new Date(start),
      rangeEnd: new Date(end),
      durationMin: duration,
    });
    return NextResponse.json({ slots });
  } catch (err) {
    if (err instanceof CalendarApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Free/busy error:", err);
    return NextResponse.json(
      { error: "Failed to find free time" },
      { status: 500 },
    );
  }
}
