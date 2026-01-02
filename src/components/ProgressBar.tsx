"use client";

import React from "react";
import { CheckCircle2, Circle } from "lucide-react";

interface ProgressBarProps {
  completed: number;
  total: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function ProgressBar({
  completed,
  total,
  showLabel = true,
  size = "md",
}: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  const sizeClasses = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  const getColor = () => {
    if (percentage === 100) return "bg-green-500";
    if (percentage >= 75) return "bg-emerald-500";
    if (percentage >= 50) return "bg-yellow-500";
    if (percentage >= 25) return "bg-orange-500";
    return "bg-slate-400";
  };

  return (
    <div className="flex items-center gap-3">
      {showLabel && (
        <div className="flex items-center gap-1.5 text-sm text-slate-600">
          <CheckCircle2 size={14} className="text-green-500" />
          <span>
            {completed}/{total} tasks
          </span>
          <span className="text-slate-400">({percentage}%)</span>
        </div>
      )}
      <div className={`flex-1 bg-slate-200 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${getColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
