"use client";

import React from "react";
import { X, Battery, Zap } from "lucide-react";
import { EnergyTimeSlot } from "@/types";

interface EnergyReminderToastProps {
  timeSlot: EnergyTimeSlot;
  label: string;
  onDismiss: () => void;
}

export default function EnergyReminderToast({
  timeSlot,
  label,
  onDismiss,
}: EnergyReminderToastProps) {
  return (
    <div className="bg-white border border-green-200 rounded-xl p-4 shadow-lg max-w-sm animate-slide-in">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Battery className="text-green-600" size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900">Log Your Energy</p>
          <p className="text-sm text-slate-600 mt-1">
            How&apos;s your {label.toLowerCase()} energy?
          </p>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <Zap size={12} />
            Track your energy to find your peak hours
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Dismiss reminder"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
