"use client";

import React, { useMemo } from "react";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { BatteryLow, BatteryFull, BatteryMedium } from "lucide-react";
import { useApp } from "@/store/store";

// Reads the most recent day that has logged energy (within the last 2 days)
// and nudges toward work that fits the level. Stays silent with no recent data.
export default function EnergyNudge() {
  const { state } = useApp();

  const recent = useMemo(() => {
    const today = startOfDay(new Date());
    // Working entries only (level 0 = "not working"), within the last 2 days.
    const working = state.energyLogs
      .filter((log) => log.level > 0)
      .filter((log) => differenceInCalendarDays(today, startOfDay(new Date(log.date))) <= 2)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (working.length === 0) return null;

    // Average the most recent logged day's entries.
    const latestDay = startOfDay(new Date(working[0].date)).getTime();
    const sameDay = working.filter(
      (log) => startOfDay(new Date(log.date)).getTime() === latestDay,
    );
    const avg = sameDay.reduce((sum, log) => sum + log.level, 0) / sameDay.length;
    const isToday = latestDay === today.getTime();
    return { avg, isToday };
  }, [state.energyLogs]);

  if (!recent) return null;

  const { avg, isToday } = recent;
  const when = isToday ? "today" : "lately";

  let config;
  if (avg <= 2.5) {
    config = {
      icon: <BatteryLow size={20} />,
      color: "text-amber-700",
      bg: "from-amber-50 to-orange-50 border-amber-200",
      headline: `Energy is running low ${when}.`,
      body: "Lean into lighter, lower-stakes work — clear small tasks, tidy the inbox, batch admin. Protect the hard, creative pushes for when you're recharged.",
    };
  } else if (avg >= 4) {
    config = {
      icon: <BatteryFull size={20} />,
      color: "text-green-700",
      bg: "from-green-50 to-emerald-50 border-green-200",
      headline: `Energy is high ${when}.`,
      body: "Good day to take on the hardest thing first — the deep work, the call you've been putting off, the bet that needs your best thinking.",
    };
  } else {
    config = {
      icon: <BatteryMedium size={20} />,
      color: "text-slate-600",
      bg: "from-slate-50 to-slate-100 border-slate-200",
      headline: `Energy is steady ${when}.`,
      body: "A balanced day — mix focused work with a few quick wins to keep momentum going.",
    };
  }

  return (
    <div className={`bg-gradient-to-br ${config.bg} border rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${config.color}`}>{config.icon}</div>
        <div>
          <p className={`text-sm font-semibold ${config.color}`}>
            {config.headline}
          </p>
          <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">
            {config.body}
          </p>
        </div>
      </div>
    </div>
  );
}
