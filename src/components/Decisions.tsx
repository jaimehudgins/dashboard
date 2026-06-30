"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Scale,
  Plus,
  Loader2,
  ArrowLeft,
  Trash2,
  Clock,
  Check,
} from "lucide-react";
import {
  Decision,
  DecisionStatus,
  fetchDecisions,
  createDecision,
  updateDecision,
  deleteDecision,
  dueForReview,
  daysSince,
} from "@/lib/decisions";

const STATUS_META: Record<DecisionStatus, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-amber-50 text-amber-700" },
  reviewed: { label: "Reviewed", cls: "bg-emerald-50 text-emerald-700" },
  archived: { label: "Archived", cls: "bg-slate-100 text-slate-500" },
};

export default function Decisions() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchDecisions()
      .then(setDecisions)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const open = decisions.find((d) => d.id === openId) || null;

  const newDecision = async () => {
    const d = await createDecision({
      decision: "",
      decided_at: new Date().toISOString().slice(0, 10),
    });
    if (d) {
      setDecisions((p) => [d, ...p]);
      setOpenId(d.id);
    }
  };

  if (open) {
    return (
      <Editor
        key={open.id}
        decision={open}
        onBack={() => setOpenId(null)}
        onPatch={(patch) =>
          setDecisions((p) =>
            p.map((d) => (d.id === open.id ? { ...d, ...patch } : d)),
          )
        }
        onDelete={async () => {
          setDecisions((p) => p.filter((d) => d.id !== open.id));
          setOpenId(null);
          await deleteDecision(open.id);
        }}
      />
    );
  }

  const due = dueForReview(decisions);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Scale className="text-indigo-500" size={22} />
            Decisions
          </h1>
          <p className="text-slate-500 mt-1">
            The bets you&rsquo;ve placed, and why. Revisit them with hindsight.
          </p>
        </div>
        <button
          onClick={newDecision}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          <Plus size={15} />
          Log a decision
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" /> Loading…
        </div>
      ) : decisions.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500">
          <Scale className="mx-auto text-slate-300 mb-3" size={32} />
          No decisions logged yet. Capture the next real call you make.
        </div>
      ) : (
        <div className="space-y-6">
          {due.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Clock size={14} />
                Due for review ({due.length})
              </h2>
              <div className="space-y-2">
                {due.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setOpenId(d.id)}
                    className="w-full text-left bg-amber-50/60 border border-amber-100 rounded-xl p-4 hover:border-amber-200 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-900 truncate">
                        {d.decision || "Untitled decision"}
                      </span>
                      <span className="flex-shrink-0 text-xs font-medium text-amber-700">
                        {daysSince(d.decided_at)} days ago
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      How did it turn out? Record the outcome.
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
              All decisions
            </h2>
            <div className="space-y-2">
              {decisions.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setOpenId(d.id)}
                  className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900 truncate">
                      {d.decision || "Untitled decision"}
                    </span>
                    <span
                      className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_META[d.status].cls}`}
                    >
                      {STATUS_META[d.status].label}
                    </span>
                  </div>
                  {d.choice && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-1">
                      {d.choice}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                    <span>{format(new Date(d.decided_at), "MMM d, yyyy")}</span>
                    {(d.tags || []).slice(0, 3).map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  rows = 2,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
      />
    </div>
  );
}

function Editor({
  decision,
  onBack,
  onPatch,
  onDelete,
}: {
  decision: Decision;
  onBack: () => void;
  onPatch: (patch: Partial<Decision>) => void;
  onDelete: () => void;
}) {
  const [d, setD] = useState(decision);
  const [saved, setSaved] = useState(true);
  const mounted = useRef(false);
  const set = (patch: Partial<Decision>) => setD((cur) => ({ ...cur, ...patch }));

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setSaved(false);
    const patch = {
      decision: d.decision,
      context: d.context,
      options: d.options,
      choice: d.choice,
      reasoning: d.reasoning,
      expected_outcome: d.expected_outcome,
      actual_outcome: d.actual_outcome,
      decided_at: d.decided_at,
      status: d.status,
      reviewed_at: d.reviewed_at,
      tags: d.tags,
    };
    const t = setTimeout(async () => {
      await updateDecision(d.id, patch);
      onPatch(patch);
      setSaved(true);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const markReviewed = () =>
    set({
      status: "reviewed",
      reviewed_at: new Date().toISOString().slice(0, 10),
    });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          All decisions
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {saved ? "Saved" : "Saving…"}
          </span>
          <button
            onClick={onDelete}
            className="text-slate-400 hover:text-red-500"
            title="Delete decision"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <input
        value={d.decision}
        onChange={(e) => set({ decision: e.target.value })}
        placeholder="The decision (e.g. 'Defer the LEAD RFP rewrite')"
        className="w-full text-2xl font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none mb-3"
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="date"
          value={d.decided_at}
          onChange={(e) => set({ decided_at: e.target.value })}
          className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
        <select
          value={d.status}
          onChange={(e) => set({ status: e.target.value as DecisionStatus })}
          className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
        >
          {(Object.keys(STATUS_META) as DecisionStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <input
          value={(d.tags || []).join(", ")}
          onChange={(e) =>
            set({
              tags: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="tags, comma separated"
          className="flex-1 min-w-[10rem] text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
      </div>

      <div className="space-y-3">
        <Field
          label="Context — why did this come up?"
          value={d.context || ""}
          onChange={(v) => set({ context: v })}
          placeholder="The situation that forced the call…"
        />
        <Field
          label="Options considered"
          value={d.options || ""}
          onChange={(v) => set({ options: v })}
        />
        <Field
          label="What you chose"
          value={d.choice || ""}
          onChange={(v) => set({ choice: v })}
        />
        <Field
          label="Reasoning"
          value={d.reasoning || ""}
          onChange={(v) => set({ reasoning: v })}
          rows={3}
        />
        <Field
          label="Expected outcome"
          value={d.expected_outcome || ""}
          onChange={(v) => set({ expected_outcome: v })}
        />

        {/* Outcome / retrospective */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-2">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              What actually happened
            </label>
            {d.reviewed_at && (
              <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                <Check size={12} /> Reviewed{" "}
                {format(new Date(d.reviewed_at), "MMM d")}
              </span>
            )}
          </div>
          <textarea
            value={d.actual_outcome || ""}
            onChange={(e) => set({ actual_outcome: e.target.value })}
            rows={3}
            placeholder="Fill this in later, with hindsight. Was the bet right?"
            className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
          />
          {d.status !== "reviewed" && (
            <button
              onClick={markReviewed}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              <Check size={14} />
              Mark reviewed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
