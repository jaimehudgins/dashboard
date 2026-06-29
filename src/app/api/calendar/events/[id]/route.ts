import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  updateEvent,
  deleteEvent,
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

// PATCH /api/calendar/events/[id] — update an event (calendarId in the body).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = await requireToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
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
    const updated = await updateEvent(token, id, input);
    return NextResponse.json({ event: updated });
  } catch (err) {
    if (err instanceof CalendarApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Update event error:", err);
    return NextResponse.json(
      { error: "Failed to update event" },
      { status: 500 },
    );
  }
}

// DELETE /api/calendar/events/[id]?calendarId=... — delete an event.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = await requireToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const calendarId = new URL(req.url).searchParams.get("calendarId");
  if (!calendarId) {
    return NextResponse.json(
      { error: "calendarId query param is required" },
      { status: 400 },
    );
  }
  try {
    await deleteEvent(token, calendarId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CalendarApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Delete event error:", err);
    return NextResponse.json(
      { error: "Failed to delete event" },
      { status: 500 },
    );
  }
}
