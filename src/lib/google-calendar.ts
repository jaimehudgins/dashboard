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

// A calendar the user owns (vs. colleagues' calendars shared to them, which
// come back as reader/writer/freeBusyReader). Only owned calendars should
// drive availability and the "what's coming up" agenda.
export function isOwnedCalendar(c: GcalCalendar): boolean {
  return c.accessRole === "owner";
}

// Owned calendars, falling back to the primary calendar if none are tagged
// "owner" (defensive — the primary is normally owner-role).
export function ownedCalendars(calendars: GcalCalendar[]): GcalCalendar[] {
  const owned = calendars.filter(isOwnedCalendar);
  if (owned.length > 0) return owned;
  return calendars.filter((c) => c.primary);
}

// Fetches events across the user's calendars, color-coded. With ownedOnly,
// only the user's own calendars are queried (for the brief agenda); otherwise
// all visible calendars are included (for the full calendar view, so shared
// colleague calendars are visible). freeBusyReader calendars expose no event
// detail, so they are never in the event list.
export async function listAllEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
  opts: { ownedOnly?: boolean } = {},
): Promise<{ events: GcalEvent[]; calendars: GcalCalendar[] }> {
  const all = await listCalendars(accessToken);
  const visible = all.filter((c) => c.accessRole !== "freeBusyReader");
  const source = opts.ownedOnly ? ownedCalendars(visible) : visible;
  const perCal = await Promise.all(
    source.map((c) =>
      listEvents(accessToken, c, timeMin, timeMax).catch(() => [] as GcalEvent[]),
    ),
  );
  const events = perCal.flat().sort((a, b) => a.start.localeCompare(b.start));
  return { events, calendars: source };
}

/* ------------------------------ Mutations ------------------------------ */

export interface EventInput {
  calendarId: string;
  title: string;
  allDay: boolean;
  // allDay: "YYYY-MM-DD". timed: "YYYY-MM-DDTHH:mm:ss" (local wall time).
  start: string;
  end: string;
  timeZone?: string;
  location?: string;
  description?: string;
  attendees?: string[]; // email addresses
  addMeet?: boolean;
}

function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function buildEventBody(input: EventInput) {
  const tz =
    input.timeZone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";

  const body: any = {
    summary: input.title,
    location: input.location || undefined,
    description: input.description || undefined,
  };

  if (input.allDay) {
    // Google all-day end date is exclusive; store start..(end+1 day).
    body.start = { date: input.start };
    body.end = { date: addDaysToYmd(input.end || input.start, 1) };
  } else {
    body.start = { dateTime: input.start, timeZone: tz };
    body.end = { dateTime: input.end, timeZone: tz };
  }

  if (input.attendees && input.attendees.length > 0) {
    body.attendees = input.attendees.map((email) => ({ email }));
  }

  if (input.addMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `leo-${Date.now()}-${Math.floor(
          (Date.now() % 100000) + (input.title.length || 1),
        )}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  return body;
}

export async function createEvent(
  accessToken: string,
  input: EventInput,
): Promise<any> {
  const params = new URLSearchParams();
  if (input.addMeet) params.set("conferenceDataVersion", "1");
  if (input.attendees?.length) params.set("sendUpdates", "all");
  const qs = params.toString() ? `?${params}` : "";
  return gcalFetch(
    accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events${qs}`,
    { method: "POST", body: JSON.stringify(buildEventBody(input)) },
  );
}

export async function updateEvent(
  accessToken: string,
  eventId: string,
  input: EventInput,
): Promise<any> {
  const params = new URLSearchParams();
  if (input.addMeet) params.set("conferenceDataVersion", "1");
  if (input.attendees?.length) params.set("sendUpdates", "all");
  const qs = params.toString() ? `?${params}` : "";
  return gcalFetch(
    accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(
      eventId,
    )}${qs}`,
    { method: "PATCH", body: JSON.stringify(buildEventBody(input)) },
  );
}

export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await gcalFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
      eventId,
    )}?sendUpdates=all`,
    { method: "DELETE" },
  );
}

/* ------------------------------ Free/busy ------------------------------ */

export interface BusyInterval {
  start: string;
  end: string;
}

export interface FreeSlot {
  start: string; // ISO
  end: string; // ISO
}

export async function queryFreeBusy(
  accessToken: string,
  timeMin: string,
  timeMax: string,
  calendarIds: string[],
): Promise<BusyInterval[]> {
  const data = await gcalFetch(accessToken, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: calendarIds.map((id) => ({ id })),
    }),
  });
  const cals = data.calendars || {};
  const busy: BusyInterval[] = [];
  for (const id of Object.keys(cals)) {
    (cals[id].busy || []).forEach((b: BusyInterval) => busy.push(b));
  }
  return busy;
}

// Pure: given busy intervals, find open slots of durationMin within working
// hours across [rangeStart, rangeEnd]. Local-time working window.
export function findFreeSlots(opts: {
  busy: BusyInterval[];
  rangeStart: Date;
  rangeEnd: Date;
  durationMin: number;
  workStartHour?: number;
  workEndHour?: number;
  weekdaysOnly?: boolean;
  stepMin?: number;
  maxSlots?: number;
}): FreeSlot[] {
  const {
    busy,
    rangeStart,
    rangeEnd,
    durationMin,
    workStartHour = 9,
    workEndHour = 17,
    weekdaysOnly = true,
    stepMin = 30,
    maxSlots = 30,
  } = opts;

  // Merge overlapping busy intervals.
  const merged: [number, number][] = [];
  busy
    .map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as [number, number])
    .sort((a, b) => a[0] - b[0])
    .forEach((iv) => {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push([iv[0], iv[1]]);
    });

  const overlapsBusy = (s: number, e: number) =>
    merged.some(([bs, be]) => s < be && e > bs);

  const slots: FreeSlot[] = [];
  const durMs = durationMin * 60000;
  const stepMs = stepMin * 60000;
  const nowMs = Date.now();

  const day = new Date(rangeStart);
  day.setHours(0, 0, 0, 0);

  while (day.getTime() <= rangeEnd.getTime() && slots.length < maxSlots) {
    const dow = day.getDay();
    if (!(weekdaysOnly && (dow === 0 || dow === 6))) {
      const dayEnd = new Date(day);
      dayEnd.setHours(workEndHour, 0, 0, 0);
      const cursor = new Date(day);
      cursor.setHours(workStartHour, 0, 0, 0);

      while (
        cursor.getTime() + durMs <= dayEnd.getTime() &&
        slots.length < maxSlots
      ) {
        const s = cursor.getTime();
        const e = s + durMs;
        if (s >= nowMs && s >= rangeStart.getTime() && !overlapsBusy(s, e)) {
          slots.push({
            start: new Date(s).toISOString(),
            end: new Date(e).toISOString(),
          });
        }
        cursor.setTime(cursor.getTime() + stepMs);
      }
    }
    day.setDate(day.getDate() + 1);
  }

  return slots;
}

export { CalendarApiError };
