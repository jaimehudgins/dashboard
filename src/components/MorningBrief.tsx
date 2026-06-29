"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Target, CalendarClock } from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";
import DailyQuote from "./DailyQuote";
import EnergyNudge from "./EnergyNudge";
import SmartInsights from "./SmartInsights";
import UnifiedTaskTable from "./UnifiedTaskTable";

interface MorningBriefProps {
  onOpenZenMode?: (task: Task) => void;
}

export default function MorningBrief({ onOpenZenMode }: MorningBriefProps) {
  const { getMomentumScore } = useApp();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const momentum = getMomentumScore();

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

      {/* Today's tasks */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Today
        </h2>
        <UnifiedTaskTable onFocusTask={onOpenZenMode} />
      </div>

      {/* Smart Insights */}
      <SmartInsights onFocusTask={onOpenZenMode} />

      {/* Calendar placeholder (wired in Phase 2: Charlie) */}
      <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-8 text-center">
        <CalendarClock className="mx-auto text-slate-300 mb-3" size={36} />
        <h3 className="text-slate-900 font-medium mb-1">Today&rsquo;s calendar</h3>
        <p className="text-sm text-slate-500">
          Your schedule will appear here once Charlie (Phase 2) connects Google
          Calendar.
        </p>
      </div>
    </div>
  );
}
