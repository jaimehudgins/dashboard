"use client";

import React, { useState, useEffect } from "react";
import { format, addDays, endOfDay, isSameDay } from "date-fns";
import { X, Search, Loader2, Clock } from "lucide-react";
import { FreeSlot } from "@/lib/google-calendar";

interface FindTimeModalProps {
  onPick: (start: Date, end: Date) => void;
  onClose: () => void;
}

const DURATIONS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "90 min", value: 90 },
];
const RANGES = [
  { label: "Next 3 days", value: 3 },
  { label: "Next 7 days", value: 7 },
  { label: "Next 14 days", value: 14 },
];

export default function FindTimeModal({ onPick, onClose }: FindTimeModalProps) {
  const [duration, setDuration] = useState(30);
  const [rangeDays, setRangeDays] = useState(7);
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const search = () => {
    setLoading(true);
    setError(null);
    const start = new Date();
    const end = endOfDay(addDays(new Date(), rangeDays));
    fetch(
      `/api/calendar/freebusy?start=${start.toISOString()}&end=${end.toISOString()}&duration=${duration}`,
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to find time");
        return data;
      })
      .then((data) => {
        setSlots(data.slots || []);
        setSearched(true);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  // Run an initial search on open.
  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group slots by calendar day.
  const byDay: { day: Date; slots: FreeSlot[] }[] = [];
  slots.forEach((s) => {
    const d = new Date(s.start);
    const bucket = byDay.find((b) => isSameDay(b.day, d));
    if (bucket) bucket.slots.push(s);
    else byDay.push({ day: d, slots: [s] });
  });

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Search size={18} className="text-indigo-500" />
            Find a time
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDuration(d.value)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  duration === d.value
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRangeDays(r.value)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  rangeDays === r.value
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={search}
              disabled={loading}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
              Search
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Open slots within working hours (9am–5pm, weekdays).
          </p>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!error && searched && slots.length === 0 && !loading && (
            <p className="text-sm text-slate-500">
              No open slots that long in this window. Try a shorter duration or a
              wider range.
            </p>
          )}
          <div className="space-y-4">
            {byDay.map(({ day, slots: daySlots }) => (
              <div key={day.toISOString()}>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  {format(day, "EEEE, MMM d")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((s) => (
                    <button
                      key={s.start}
                      onClick={() => onPick(new Date(s.start), new Date(s.end))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                    >
                      <Clock size={13} className="text-slate-400" />
                      {format(new Date(s.start), "h:mm a")}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
