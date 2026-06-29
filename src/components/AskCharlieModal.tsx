"use client";

import React, { useState } from "react";
import { format, isSameDay } from "date-fns";
import { X, Sparkles, Loader2, Clock, ArrowLeft } from "lucide-react";
import { FreeSlot } from "@/lib/google-calendar";

interface Proposal {
  title: string;
  attendees: string[];
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
  "When's my next meeting with Rasha?",
  "What's on my calendar Thursday?",
  "Find me 30 minutes for deep work next week, mornings",
];

export default function AskCharlieModal({
  onPick,
  onClose,
}: AskCharlieModalProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [asked, setAsked] = useState("");

  const ask = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Charlie couldn't answer");
      setAnswer(data.answer);
      setSlots(data.slots || []);
      setProposal(data.proposal || null);
      setAsked(question.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setAnswer(null);
    setSlots([]);
    setProposal(null);
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

        {answer === null ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-500">
              Ask about your schedule or find time — Charlie reads your calendar
              and answers.
            </p>
            <textarea
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
              }}
              rows={3}
              placeholder="e.g. When's my next meeting with Rasha?"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setQuestion(ex)}
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
                disabled={loading || !question.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
              >
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Sparkles size={15} />
                )}
                Ask
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 border-b border-slate-100">
              <button
                onClick={reset}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-3"
              >
                <ArrowLeft size={12} />
                Ask something else
              </button>
              <p className="text-xs text-slate-400 mb-1">{asked}</p>
              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                {answer}
              </p>
            </div>
            {slots.length > 0 && (
              <div className="p-5 overflow-y-auto flex-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Open times — pick one to book
                </p>
                <div className="space-y-4">
                  {byDay.map(({ day, slots: daySlots }) => (
                    <div key={day.toISOString()}>
                      <div className="text-xs font-semibold text-slate-500 mb-2">
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
                                proposal?.title || "Meeting",
                                proposal?.attendees || [],
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
