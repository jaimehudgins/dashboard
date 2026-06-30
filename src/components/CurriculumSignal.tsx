"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sprout,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  CurriculumSignal as Signal,
  fetchCurriculumSignals,
} from "@/lib/curriculum-signal";

const SENT_ICON: Record<string, React.ReactNode> = {
  positive: <TrendingUp size={13} className="text-emerald-500" />,
  negative: <TrendingDown size={13} className="text-red-500" />,
  neutral: <Minus size={13} className="text-slate-400" />,
};

export default function CurriculumSignal() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [groupBy, setGroupBy] = useState<"lesson" | "partner">("lesson");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchCurriculumSignals()
      .then((s) => setSignals(s.filter((x) => x.lesson_ref && x.lesson_ref !== "—")))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const scan = async () => {
    setScanning(true);
    setError(null);
    try {
      const r = await fetch("/api/curriculum-signal/scan", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Scan failed");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const groups = useMemo(() => {
    const m = new Map<string, Signal[]>();
    for (const s of signals) {
      const key = groupBy === "lesson" ? s.lesson_ref : s.partner_name || "Unknown";
      (m.get(key) || m.set(key, []).get(key)!).push(s);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [signals, groupBy]);

  const verdict = (items: Signal[]) => {
    const pos = items.filter((i) => i.sentiment === "positive").length;
    const neg = items.filter((i) => i.sentiment === "negative").length;
    if (neg > pos)
      return { label: "Struggling", cls: "bg-red-50 text-red-700" };
    if (pos > neg)
      return { label: "Landing well", cls: "bg-emerald-50 text-emerald-700" };
    return { label: "Mixed", cls: "bg-slate-100 text-slate-500" };
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sprout className="text-emerald-500" size={22} />
            Curriculum Signal
          </h1>
          <p className="text-slate-500 mt-1">
            How lessons are landing across partners, mined from your meetings.
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
        >
          {scanning ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          {scanning ? "Scanning…" : "Scan meetings"}
        </button>
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm mb-4">
        <button
          onClick={() => setGroupBy("lesson")}
          className={`px-3 py-1.5 font-medium ${groupBy === "lesson" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          By lesson
        </button>
        <button
          onClick={() => setGroupBy("partner")}
          className={`px-3 py-1.5 font-medium border-l border-slate-200 ${groupBy === "partner" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          By partner
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" /> Loading…
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500">
          No curriculum signal yet. Click <strong>Scan meetings</strong> to mine
          your partner meetings.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(([key, items]) => {
            const v = groupBy === "lesson" ? verdict(items) : null;
            return (
              <div
                key={key}
                className="bg-white border border-slate-200 rounded-xl p-4"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h2 className="font-semibold text-slate-900">{key}</h2>
                  {v && (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${v.cls}`}
                    >
                      {v.label}
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {items.map((s) => (
                    <div key={s.id} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 flex-shrink-0">
                        {SENT_ICON[s.sentiment || "neutral"]}
                      </span>
                      <div className="min-w-0">
                        <span className="text-slate-700">
                          {groupBy === "lesson" ? s.partner_name : s.lesson_ref}
                        </span>
                        {s.note && (
                          <span className="text-slate-500"> — {s.note}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
