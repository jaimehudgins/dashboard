// Minimal Google Calendar API v3 client over REST (no googleapis dependency).
// All calls take a Google OAuth access token (from the NextAuth session) and
// run server-side via the /api/calendar routes.

const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export interface GcalCalendar {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole?: string;
}

export interface GcalAttendee {
  email?: string;
  displayName?: string;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  organizer?: boolean;
  self?: boolean;
}

export interface GcalEvent {
  id: string;
  calendarId: string;
  calendarSummary: string;
  color: string;
  title: string;
  start: string; // ISO datetime (timed) or YYYY-MM-DD (all-day)
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  hangoutLink?: string;
  htmlLink?: string;
  attendees?: GcalAttendee[];
  status?: string;
  organizer?: { email?: string; displayName?: string; self?: boolean };
}

class CalendarApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "CalendarApiError";
  }
}

async function gcalFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<any> {
  const res = await fetch(`${CAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new CalendarApiError(
      `Calendar API ${res.status}: ${body.slice(0, 200)}`,
      res.status,
    );
  }
  if (res.status === 204) return null;
  return res.json();
}

const DEFAULT_COLOR = "#4285f4";

export async function listCalendars(
  accessToken: string,
): Promise<GcalCalendar[]> {
  const data = await gcalFetch(accessToken, "/users/me/calendarList");
  return (data.items || []).map((c: any) => ({
    id: c.id,
    summary: c.summaryOverride || c.summary || c.id,
    primary: !!c.primary,
    backgroundColor: c.backgroundColor,
    foregroundColor: c.foregroundColor,
    accessRole: c.accessRole,
  }));
}

function normalizeEvent(
  raw: any,
  cal: GcalCalendar,
): GcalEvent {
  const allDay = !!raw.start?.date;
  return {
    id: raw.id,
    calendarId: cal.id,
    calendarSummary: cal.summary,
    color: cal.backgroundColor || DEFAULT_COLOR,
    title: raw.summary || "(no title)",
    start: raw.start?.dateTime || raw.start?.date,
    end: raw.end?.dateTime || raw.end?.date,
    allDay,
    location: raw.location,
    description: raw.description,
    hangoutLink: raw.hangoutLink,
    htmlLink: raw.htmlLink,
    attendees: raw.attendees,
    status: raw.status,
    organizer: raw.organizer,
  };
}

export async function listEvents(
  accessToken: string,
  cal: GcalCalendar,
  timeMin: string,
  timeMax: string,
): Promise<GcalEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const data = await gcalFetch(
    accessToken,
    `/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
  );
  return (data.items || [])
    .filter((e: any) => e.status !== "cancelled" && e.start)
    .map((e: any) => normalizeEvent(e, cal));
}

// Fetches events across every calendar in the user's list, color-coded by
// calendar. Returns both the merged events and the calendar list (for legends).
export async function listAllEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<{ events: GcalEvent[]; calendars: GcalCalendar[] }> {
  const calendars = await listCalendars(accessToken);
  const perCal = await Promise.all(
    calendars
      .filter((c) => c.accessRole !== "freeBusyReader")
      .map((c) =>
        listEvents(accessToken, c, timeMin, timeMax).catch(() => [] as GcalEvent[]),
      ),
  );
  const events = perCal.flat().sort((a, b) => a.start.localeCompare(b.start));
  return { events, calendars };
}

export { CalendarApiError };
