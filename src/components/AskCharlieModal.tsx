"use client";

import React, { useState } from "react";
import { format, isSameDay } from "date-fns";
import { X, Sparkles, Loader2, Clock, ArrowLeft } from "lucide-react";
import { FreeSlot } from "@/lib/google-calendar";

interface ParsedSchedule {
  title: string;
  durationMinutes: number;
  attendees: string[];
  earliestDate: string;
  latestDate: string;
  partOfDay: "morning" | "afternoon" | "any";
}

interface AskCharlieModalProps {
  onPick: (
    start: Date,
    end: Date,
    title: string,
    attendees: string[],
  ) => void;
  onClose: () => void;
}

const EXAMPLES = [
  "Find me 30 minutes for deep work next week, mornings",
  "An hour with the team sometime in the next 3 days",
  "A 45-minute call Thursday or Friday afternoon",
];

export default function AskCharlieModal({
  onPick,
  onClose,
}: AskCharlieModalProps) {
  const [request, setRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedSchedule | null>(null);
  const [slots, setSlots] = useState<FreeSlot[]>([]);

  const ask = async () => {
    if (!request.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: request.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't find a time");
      setParsed(data.parsed);
      setSlots(data.slots || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // Group slots by day.
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
            <Sparkles size={18} className="text-indigo-500" />
            Ask Charlie
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {!parsed ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-500">
              Describe the meeting in plain English — Charlie reads your calendar
              and proposes open times.
            </p>
            <textarea
              autoFocus
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
              }}
              rows={3}
              placeholder="e.g. Find me 30 minutes for a call next Tuesday morning"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setRequest(ex)}
                  className="text-xs text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-full px-3 py-1 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end">
              <button
                onClick={ask}
                disabled={loading || !request.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Sparkles size={15} />
                )}
                Find times
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 border-b border-slate-100">
              <button
                onClick={() => {
                  setParsed(null);
                  setSlots([]);
                }}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-3"
              >
                <ArrowLeft size={12} />
                New request
              </button>
              <p className="text-sm text-slate-700">
                <span className="font-medium">{parsed.title}</span> ·{" "}
                {parsed.durationMinutes} min
                {parsed.partOfDay !== "any" ? ` · ${parsed.partOfDay}s` : ""}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {format(new Date(`${parsed.earliestDate}T00:00:00`), "MMM d")} –{" "}
                {format(new Date(`${parsed.latestDate}T00:00:00`), "MMM d")}
                {parsed.attendees.length > 0
                  ? ` · with ${parsed.attendees.join(", ")}`
                  : ""}
              </p>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {slots.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No open slots that fit. Try a wider range or a shorter meeting.
                </p>
              ) : (
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
                            onClick={() =>
                              onPick(
                                new Date(s.start),
                                new Date(s.end),
                                parsed.title,
                                parsed.attendees,
                              )
                            }
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
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
