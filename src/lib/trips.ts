// Shared trip storage (localStorage) used by the Travel page and the Donna
// inbox ("Add to trip"). Kept light — no backend.

export interface PackItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TripEmail {
  threadId: string;
  subject: string;
  from: string;
  date: string;
}

export interface Trip {
  id: string;
  destination: string;
  start: string; // YYYY-MM-DD
  end: string;
  notes?: string;
  packing: PackItem[];
  partnerIds?: string[];
  calendarEventId?: string;
  calendarEventLink?: string;
  emails?: TripEmail[];
}

export const TRIPS_KEY = "leo.trips";

export const tripUid = () =>
  `${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`;

export function loadTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(TRIPS_KEY);
    return raw ? (JSON.parse(raw) as Trip[]) : [];
  } catch {
    return [];
  }
}

export function saveTrips(trips: Trip[]): void {
  try {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
  } catch {
    /* ignore */
  }
}

// Attach (or de-dupe-replace) an email on a trip; returns the updated list.
export function attachEmailToTrip(tripId: string, email: TripEmail): Trip[] {
  const next = loadTrips().map((t) =>
    t.id === tripId
      ? {
          ...t,
          emails: [
            ...(t.emails || []).filter((e) => e.threadId !== email.threadId),
            email,
          ],
        }
      : t,
  );
  saveTrips(next);
  return next;
}
