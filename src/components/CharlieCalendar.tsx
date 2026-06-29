"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addDays,
  addWeeks,
  addMonths,
  isSameDay,
  isSameMonth,
  isToday,
  differenceInMinutes,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MapPin,
  Video,
  Users,
  X,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { GcalEvent, GcalCalendar } from "@/lib/google-calendar";
import EventEditor from "./EventEditor";

type View = "day" | "week" | "month";
const HOUR_PX = 48;
const DAY_START_SCROLL = 7; // scroll the time grid to ~7am on load

// All-day events arrive as YYYY-MM-DD; parse as local midnight to avoid TZ drift.
function parseStart(ev: GcalEvent): Date {
  if (ev.allDay) {
    const [y, m, d] = ev.start.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(ev.start);
}
function parseEnd(ev: GcalEvent): Date {
  if (ev.allDay) {
    const [y, m, d] = ev.end.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(ev.end);
}

// Simple lane packing so overlapping events sit side by side.
interface PlacedEvent {
  ev: GcalEvent;
  lane: number;
  lanes: number;
  topPx: number;
  heightPx: number;
}
function layoutDay(events: GcalEvent[], day: Date): PlacedEvent[] {
  const timed = events
    .filter((e) => !e.allDay)
    .filter((e) => isSameDay(parseStart(e), day))
    .sort((a, b) => parseStart(a).getTime() - parseStart(b).getTime());

  // Greedy lane assignment.
  const laneEnds: number[] = [];
  const assigned = timed.map((ev) => {
    const start = parseStart(ev).getTime();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = parseEnd(ev).getTime();
    return { ev, lane };
  });

  // Cluster width = max lanes among overlapping neighbours (approximate: global max).
  const lanes = Math.max(1, laneEnds.length);

  return assigned.map(({ ev, lane }) => {
    const start = parseStart(ev);
    const end = parseEnd(ev);
    const minutesFromMidnight =
      start.getHours() * 60 + start.getMinutes();
    const duration = Math.max(20, differenceInMinutes(end, start));
    return {
      ev,
      lane,
      lanes,
      topPx: (minutesFromMidnight / 60) * HOUR_PX,
      heightPx: (duration / 60) * HOUR_PX,
    };
  });
}

interface CharlieCalendarProps {
  onSelectEvent?: (ev: GcalEvent) => void;
}

export default function CharlieCalendar({ onSelectEvent }: CharlieCalendarProps) {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<GcalEvent[]>([]);
  const [calendars, setCalendars] = useState<GcalCalendar[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GcalEvent | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorEvent, setEditorEvent] = useState<GcalEvent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  const hasWritableCalendar = useMemo(
    () =>
      calendars.some(
        (c) => c.accessRole === "owner" || c.accessRole === "writer",
      ),
    [calendars],
  );

  const range = useMemo(() => {
    if (view === "day") return { start: startOfDay(anchor), end: endOfDay(anchor) };
    if (view === "week") {
      return {
        start: startOfWeek(anchor, { weekStartsOn: 1 }),
        end: endOfWeek(anchor, { weekStartsOn: 1 }),
      };
    }
    return {
      start: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }),
    };
  }, [view, anchor]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(
      `/api/calendar/events?start=${range.start.toISOString()}&end=${range.end.toISOString()}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load calendar");
        return data;
      })
      .then((data) => {
        setEvents(data.events || []);
        setCalendars(data.calendars || []);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });
    return () => controller.abort();
  }, [range.start, range.end, refreshKey]);

  // Scroll the time grid to morning on mount / view change.
  useEffect(() => {
    if ((view === "week" || view === "day") && scrollRef.current) {
      scrollRef.current.scrollTop = DAY_START_SCROLL * HOUR_PX;
    }
  }, [view]);

  const visibleEvents = useMemo(
    () => events.filter((e) => !hidden.has(e.calendarId)),
    [events, hidden],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      setAnchor((a) =>
        view === "day"
          ? addDays(a, dir)
          : view === "week"
            ? addWeeks(a, dir)
            : addMonths(a, dir),
      );
    },
    [view],
  );

  const title = useMemo(() => {
    if (view === "day") return format(anchor, "EEEE, MMMM d, yyyy");
    if (view === "month") return format(anchor, "MMMM yyyy");
    return `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`;
  }, [view, anchor, range]);

  const handleSelect = (ev: GcalEvent) => {
    setSelected(ev);
    onSelectEvent?.(ev);
  };

  const days =
    view === "day"
      ? [anchor]
      : eachDayOfInterval({ start: range.start, end: range.end });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center">
            <CalendarDays className="text-blue-500" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Charlie</h1>
            <p className="text-slate-500 text-sm">{title}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Nav */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => step(-1)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className="px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => step(1)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Next"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {/* View toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            {(["day", "week", "month"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-sm rounded-md capitalize transition-colors ${
                  view === v
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {/* New event */}
          {hasWritableCalendar && (
            <button
              onClick={() => {
                setEditorEvent(null);
                setEditorOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              <Plus size={16} />
              New event
            </button>
          )}
        </div>
      </div>

      {/* Calendar legend */}
      {calendars.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {calendars
            .filter((c) => c.accessRole !== "freeBusyReader")
            .map((c) => {
              const off = hidden.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                      return next;
                    })
                  }
                  className={`flex items-center gap-1.5 text-xs transition-opacity ${
                    off ? "opacity-40" : ""
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: c.backgroundColor || "#4285f4" }}
                  />
                  <span className="text-slate-600">{c.summary}</span>
                </button>
              );
            })}
        </div>
      )}

      {/* Error / loading */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {loading && !error && (
        <div className="text-sm text-slate-400 py-2">Loading calendar…</div>
      )}

      {/* Views */}
      {!error &&
        (view === "month" ? (
          <MonthGrid
            days={days}
            anchor={anchor}
            events={visibleEvents}
            onSelect={handleSelect}
          />
        ) : (
          <TimeGrid
            days={days}
            events={visibleEvents}
            scrollRef={scrollRef}
            onSelect={handleSelect}
          />
        ))}

      {selected && (
        <EventDetail
          event={selected}
          canEdit={
            calendars.find((c) => c.id === selected.calendarId)?.accessRole ===
              "owner" ||
            calendars.find((c) => c.id === selected.calendarId)?.accessRole ===
              "writer"
          }
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditorEvent(selected);
            setSelected(null);
            setEditorOpen(true);
          }}
          onDeleted={() => {
            setSelected(null);
            reload();
          }}
        />
      )}

      {editorOpen && (
        <EventEditor
          calendars={calendars}
          event={editorEvent}
          defaultDate={anchor}
          onSaved={reload}
          onClose={() => {
            setEditorOpen(false);
            setEditorEvent(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------ Time grid ------------------------------ */

function TimeGrid({
  days,
  events,
  scrollRef,
  onSelect,
}: {
  days: Date[];
  events: GcalEvent[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (ev: GcalEvent) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const allDayByDay = days.map((day) =>
    events.filter((e) => e.allDay && isSameDay(parseStart(e), day)),
  );
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Day headers */}
      <div
        className="grid border-b border-slate-200"
        style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}
      >
        <div className="border-r border-slate-100" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="px-2 py-2 text-center border-r border-slate-100 last:border-r-0"
          >
            <div className="text-xs text-slate-400">{format(day, "EEE")}</div>
            <div
              className={`text-sm font-semibold ${
                isToday(day)
                  ? "text-indigo-600"
                  : "text-slate-700"
              }`}
            >
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* All-day row */}
      {hasAllDay && (
        <div
          className="grid border-b border-slate-200 bg-slate-50/50"
          style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}
        >
          <div className="px-1 py-1 text-[10px] text-slate-400 text-right pr-2 border-r border-slate-100">
            all-day
          </div>
          {allDayByDay.map((list, i) => (
            <div
              key={i}
              className="p-1 space-y-1 border-r border-slate-100 last:border-r-0 min-h-[28px]"
            >
              {list.map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => onSelect(ev)}
                  className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate text-white"
                  style={{ backgroundColor: ev.color }}
                  title={ev.title}
                >
                  {ev.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 600 }}>
        <div
          className="grid relative"
          style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}
        >
          {/* Hour labels */}
          <div className="border-r border-slate-100">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_PX }}
                className="text-[10px] text-slate-400 text-right pr-2 -translate-y-1.5"
              >
                {h === 0 ? "" : format(new Date(2020, 0, 1, h), "h a")}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const placed = layoutDay(events, day);
            return (
              <div
                key={day.toISOString()}
                className="relative border-r border-slate-100 last:border-r-0"
                style={{ height: 24 * HOUR_PX }}
              >
                {/* hour lines */}
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{ top: h * HOUR_PX }}
                    className="absolute left-0 right-0 border-t border-slate-100"
                  />
                ))}
                {/* now line */}
                {isToday(day) && <NowLine />}
                {/* events */}
                {placed.map(({ ev, lane, lanes, topPx, heightPx }) => {
                  const widthPct = 100 / lanes;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onSelect(ev)}
                      className="absolute rounded-md px-1.5 py-0.5 text-left text-white overflow-hidden hover:brightness-95 transition-all"
                      style={{
                        top: topPx,
                        height: heightPx,
                        left: `calc(${lane * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        backgroundColor: ev.color,
                      }}
                      title={ev.title}
                    >
                      <div className="text-[11px] font-medium leading-tight truncate">
                        {ev.title}
                      </div>
                      {heightPx > 30 && (
                        <div className="text-[10px] opacity-80 truncate">
                          {format(parseStart(ev), "h:mm a")}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowLine() {
  const now = new Date();
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX;
  return (
    <div
      className="absolute left-0 right-0 z-10 pointer-events-none"
      style={{ top }}
    >
      <div className="h-px bg-red-500" />
      <div className="w-2 h-2 rounded-full bg-red-500 -mt-1 -ml-1" />
    </div>
  );
}

/* ------------------------------ Month grid ------------------------------ */

function MonthGrid({
  days,
  anchor,
  events,
  onSelect,
}: {
  days: Date[];
  anchor: Date;
  events: GcalEvent[];
  onSelect: (ev: GcalEvent) => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-200">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-xs font-medium text-slate-400 text-center"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = events
            .filter((e) => isSameDay(parseStart(e), day))
            .sort((a, b) => {
              if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
              return parseStart(a).getTime() - parseStart(b).getTime();
            });
          const inMonth = isSameMonth(day, anchor);
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[104px] border-r border-b border-slate-100 p-1.5 ${
                inMonth ? "" : "bg-slate-50/50"
              }`}
            >
              <div
                className={`text-xs mb-1 ${
                  isToday(day)
                    ? "w-5 h-5 flex items-center justify-center rounded-full bg-indigo-600 text-white font-semibold"
                    : inMonth
                      ? "text-slate-700"
                      : "text-slate-300"
                }`}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => onSelect(ev)}
                    className="w-full flex items-center gap-1 text-left text-[11px] truncate hover:bg-slate-50 rounded px-0.5"
                    title={ev.title}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ev.color }}
                    />
                    {!ev.allDay && (
                      <span className="text-slate-400">
                        {format(parseStart(ev), "h:mm")}
                      </span>
                    )}
                    <span className="truncate text-slate-700">{ev.title}</span>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-slate-400 px-0.5">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------- Event detail ----------------------------- */

function EventDetail({
  event,
  canEdit,
  onClose,
  onEdit,
  onDeleted,
}: {
  event: GcalEvent;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const start = parseStart(event);
  const end = parseEnd(event);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/calendar/events/${event.id}?calendarId=${encodeURIComponent(
          event.calendarId,
        )}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3">
            <span
              className="w-3 h-3 rounded-sm mt-1.5 flex-shrink-0"
              style={{ backgroundColor: event.color }}
            />
            <h2 className="text-lg font-semibold text-slate-900">
              {event.title}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {canEdit && (
              <>
                <button
                  onClick={onEdit}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                  aria-label="Edit event"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition-colors"
                  aria-label="Delete event"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {confirmDelete && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800 mb-2">
              Delete &ldquo;{event.title}&rdquo;?
              {event.attendees && event.attendees.length > 0
                ? " Guests will be notified."
                : ""}
            </p>
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg transition-colors"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3 text-sm">
          <div className="text-slate-600">
            {event.allDay
              ? `${format(start, "EEEE, MMMM d")} · All day`
              : `${format(start, "EEEE, MMMM d · h:mm a")} – ${format(end, "h:mm a")}`}
          </div>
          <div className="text-xs text-slate-400">{event.calendarSummary}</div>

          {event.location && (
            <div className="flex items-start gap-2 text-slate-600">
              <MapPin size={15} className="mt-0.5 flex-shrink-0 text-slate-400" />
              {event.location}
            </div>
          )}
          {event.hangoutLink && (
            <a
              href={event.hangoutLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-indigo-600 hover:underline"
            >
              <Video size={15} className="flex-shrink-0" />
              Join Google Meet
            </a>
          )}
          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-start gap-2 text-slate-600">
              <Users size={15} className="mt-0.5 flex-shrink-0 text-slate-400" />
              <div className="space-y-0.5">
                {event.attendees.slice(0, 8).map((a, i) => (
                  <div key={i} className="text-xs">
                    {a.displayName || a.email}
                    {a.responseStatus === "accepted" && " ✓"}
                    {a.responseStatus === "declined" && " ✗"}
                  </div>
                ))}
              </div>
            </div>
          )}
          {event.description && (
            <div className="text-slate-600 whitespace-pre-wrap text-sm border-t border-slate-100 pt-3 max-h-40 overflow-y-auto">
              {event.description.replace(/<[^>]+>/g, "")}
            </div>
          )}
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-slate-400 hover:text-slate-600 pt-2"
            >
              Open in Google Calendar →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
