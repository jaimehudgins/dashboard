"use client";

import React, { useState, useEffect } from "react";
import { format, startOfDay, endOfDay } from "date-fns";
import { CalendarDays, Video, MapPin } from "lucide-react";
import { GcalEvent } from "@/lib/google-calendar";

function startDate(ev: GcalEvent): Date {
  if (ev.allDay) {
    const [y, m, d] = ev.start.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(ev.start);
}

// Compact list of today's calendar events for the morning brief.
export default function TodayAgenda() {
  const [events, setEvents] = useState<GcalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const start = startOfDay(new Date()).toISOString();
    const end = endOfDay(new Date()).toISOString();
    fetch(`/api/calendar/events?start=${start}&end=${end}&scope=owned`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load calendar");
        return data;
      })
      .then((data) => {
        const sorted = (data.events as GcalEvent[]).sort((a, b) => {
          if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
          return startDate(a).getTime() - startDate(b).getTime();
        });
        setEvents(sorted);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={18} className="text-blue-500" />
        <h2 className="text-sm font-semibold text-slate-700">
          Today&rsquo;s calendar
        </h2>
        <a
          href="/calendar"
          className="ml-auto text-xs text-indigo-600 hover:underline"
        >
          Open Charlie →
        </a>
      </div>

      {loading && (
        <p className="text-sm text-slate-400 py-2">Loading your schedule…</p>
      )}

      {error && (
        <p className="text-sm text-slate-400 py-2">
          Calendar unavailable{error.includes("sign in") ? " — sign in again" : ""}.
        </p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="text-sm text-slate-500 py-2">
          Nothing on the calendar today. A clear runway.
        </p>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="space-y-1">
          {events.map((ev) => (
            <a
              key={ev.id}
              href={ev.htmlLink || "/calendar"}
              target={ev.htmlLink ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="w-16 flex-shrink-0 text-xs text-slate-500 text-right">
                {ev.allDay ? "All day" : format(startDate(ev), "h:mm a")}
              </div>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: ev.color }}
              />
              <span className="flex-1 text-sm text-slate-800 truncate">
                {ev.title}
              </span>
              {ev.location && !ev.hangoutLink && (
                <MapPin size={13} className="text-slate-300 flex-shrink-0" />
              )}
              {ev.hangoutLink && (
                <Video size={13} className="text-slate-400 flex-shrink-0" />
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
