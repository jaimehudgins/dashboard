"use client";

import React, { useEffect, useState, useMemo } from "react";
import { format, startOfDay } from "date-fns";
import { Target, CheckCircle2, Circle } from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";
import {
  FocusItem,
  fetchFocusItems,
  toggleFocusItem,
} from "@/lib/focus-items";
import DailyQuote from "./DailyQuote";
import EnergyNudge from "./EnergyNudge";
import SmartInsights from "./SmartInsights";
import TodayAgenda from "./TodayAgenda";
import UnifiedTaskTable from "./UnifiedTaskTable";

interface MorningBriefProps {
  onOpenZenMode?: (task: Task) => void;
}

export default function MorningBrief({ onOpenZenMode }: MorningBriefProps) {
  const { state, getMomentumScore } = useApp();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const momentum = getMomentumScore();

  // Free-form focus notes chosen at End of Day for today.
  const [focusNotes, setFocusNotes] = useState<FocusItem[]>([]);
  useEffect(() => {
    fetchFocusItems(format(new Date(), "yyyy-MM-dd")).then(setFocusNotes);
  }, []);

  const toggleNote = (item: FocusItem) => {
    setFocusNotes((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
    );
    toggleFocusItem(item.id, !item.done);
  };

  // Tasks chosen at End of Day as today's focus.
  const focusTasks = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    return state.tasks.filter(
      (t) =>
        t.status !== "completed" &&
        !t.parentTaskId &&
        t.focusDate &&
        startOfDay(new Date(t.focusDate)).getTime() === today,
    );
  }, [state.tasks]);

  return (
    <div className="space-y-8">
      {/* Daily West Wing quote */}
      <DailyQuote />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            What does the day look like?
          </h1>
          <p className="text-slate-500 mt-1">
            {mounted ? format(new Date(), "EEEE, MMMM d, yyyy") : " "}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Target size={12} />
            Momentum
          </div>
          <div className="text-xl font-bold text-indigo-600">{momentum}%</div>
        </div>
      </div>

      {/* Energy-aware nudge */}
      <EnergyNudge />

      {/* Today's calendar */}
      <TodayAgenda />

      {/* Today's focus — chosen at End of Day */}
      {(focusTasks.length > 0 || focusNotes.length > 0) && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Target size={14} className="text-indigo-500" />
            Today&rsquo;s focus
          </h2>
          <div className="bg-white border border-indigo-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {focusNotes.map((item) => (
              <div
                key={item.id}
                className="w-full flex items-center gap-3 px-4 py-3"
              >
                <button
                  onClick={() => toggleNote(item)}
                  className="flex-shrink-0 text-indigo-400 hover:text-indigo-600 transition-colors"
                  aria-label={item.done ? "Mark not done" : "Mark done"}
                >
                  {item.done ? (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  ) : (
                    <Circle size={16} />
                  )}
                </button>
                <span
                  className={`flex-1 text-sm ${
                    item.done
                      ? "text-slate-400 line-through"
                      : "font-medium text-slate-800"
                  }`}
                >
                  {item.text}
                </span>
                <span className="text-xs text-slate-400 flex-shrink-0">
                  Intention
                </span>
              </div>
            ))}
            {focusTasks.map((t) => {
              const project = state.projects.find((p) => p.id === t.projectId);
              return (
                <button
                  key={t.id}
                  onClick={() => onOpenZenMode?.(t)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/50 text-left transition-colors"
                >
                  <Target size={15} className="text-indigo-400 flex-shrink-0" />
                  <span className="flex-1 text-sm font-medium text-slate-800 truncate">
                    {t.title}
                  </span>
                  {project && (
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {project.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Due soon — overdue or due in the next couple days */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Due soon
          </h2>
          <a
            href="/"
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            See all tasks →
          </a>
        </div>
        <UnifiedTaskTable
          onFocusTask={onOpenZenMode}
          initialDueFilter="soon"
          compact
        />
      </div>

      {/* Smart Insights */}
      <SmartInsights onFocusTask={onOpenZenMode} />
    </div>
  );
}
