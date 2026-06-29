"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { X, Loader2 } from "lucide-react";
import { GcalEvent, GcalCalendar, EventInput } from "@/lib/google-calendar";

interface EventEditorProps {
  calendars: GcalCalendar[];
  event?: GcalEvent | null; // present → edit mode
  defaultDate?: Date; // when creating
  defaultStart?: Date; // when creating from a picked slot
  defaultEnd?: Date;
  defaultTitle?: string;
  defaultAttendees?: string[];
  onSaved: () => void;
  onClose: () => void;
}

const writable = (c: GcalCalendar) =>
  c.accessRole === "owner" || c.accessRole === "writer";

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}
function hm(d: Date) {
  return format(d, "HH:mm");
}

export default function EventEditor({
  calendars,
  event,
  defaultDate,
  defaultStart,
  defaultEnd,
  defaultTitle,
  defaultAttendees,
  onSaved,
  onClose,
}: EventEditorProps) {
  const isEdit = !!event;
  const writableCals = calendars.filter(writable);

  // Initial values
  const initStart = event
    ? event.allDay
      ? new Date(`${event.start}T09:00:00`)
      : new Date(event.start)
    : defaultStart
      ? new Date(defaultStart)
      : defaultDate
        ? new Date(new Date(defaultDate).setHours(9, 0, 0, 0))
        : new Date(new Date().setMinutes(0, 0, 0));
  const initEnd = event
    ? event.allDay
      ? initStart
      : new Date(event.end)
    : defaultEnd
      ? new Date(defaultEnd)
      : new Date(initStart.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState(
    event?.title === "(no title)" ? "" : event?.title || defaultTitle || "",
  );
  const [calendarId, setCalendarId] = useState(
    event?.calendarId ||
      writableCals.find((c) => c.primary)?.id ||
      writableCals[0]?.id ||
      "",
  );
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [date, setDate] = useState(ymd(initStart));
  const [startTime, setStartTime] = useState(hm(initStart));
  const [endTime, setEndTime] = useState(hm(initEnd));
  const [location, setLocation] = useState(event?.location || "");
  const [description, setDescription] = useState(
    event?.description?.replace(/<[^>]+>/g, "") || "",
  );
  const [attendees, setAttendees] = useState(
    event
      ? (event.attendees || [])
          .map((a) => a.email)
          .filter(Boolean)
          .join(", ")
      : (defaultAttendees || []).join(", "),
  );
  const [addMeet, setAddMeet] = useState(!!event?.hangoutLink);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildPayload = (): EventInput => {
    const emails = attendees
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));
    return {
      calendarId,
      title: title.trim() || "(no title)",
      allDay,
      start: allDay ? date : `${date}T${startTime}:00`,
      end: allDay ? date : `${date}T${endTime}:00`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      attendees: emails.length ? emails : undefined,
      addMeet,
    };
  };

  const handleSave = async () => {
    if (!calendarId) {
      setError("No writable calendar available.");
      return;
    }
    if (!allDay && endTime <= startTime) {
      setError("End time must be after the start time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      const res = await fetch(
        isEdit ? `/api/calendar/events/${event!.id}` : "/api/calendar/events",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save event");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEdit ? "Edit event" : "New event"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Title
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a title"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Calendar
            </label>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {writableCals.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summary}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded border-slate-300"
            />
            All day
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className={allDay ? "col-span-2" : ""}>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {!allDay && (
              <div className="grid grid-cols-2 gap-2 col-span-1">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Start
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    End
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Location
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add a location"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Guests
            </label>
            <input
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="email@example.com, …"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={addMeet}
              onChange={(e) => setAddMeet(e.target.checked)}
              disabled={isEdit && !!event?.hangoutLink}
              className="rounded border-slate-300"
            />
            Add Google Meet
            {isEdit && !!event?.hangoutLink && (
              <span className="text-xs text-slate-400">(already added)</span>
            )}
          </label>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Add details"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-100 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !calendarId}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {isEdit ? "Save changes" : "Create event"}
          </button>
        </div>
      </div>
    </div>
  );
}
