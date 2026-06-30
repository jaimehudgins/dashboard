"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Target } from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";
import DailyQuote from "./DailyQuote";
import EnergyNudge from "./EnergyNudge";
import SmartInsights from "./SmartInsights";
import TodayAgenda from "./TodayAgenda";
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

      {/* Today's calendar */}
      <TodayAgenda />

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
