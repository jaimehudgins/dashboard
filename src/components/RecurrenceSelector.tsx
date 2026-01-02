"use client";

import React from "react";
import { Repeat, X } from "lucide-react";
import { RecurrenceRule } from "@/types";

interface RecurrenceSelectorProps {
  value: RecurrenceRule;
  onChange: (value: RecurrenceRule) => void;
  endDate?: Date;
  onEndDateChange: (date: Date | undefined) => void;
}

const recurrenceOptions: { value: RecurrenceRule; label: string }[] = [
  { value: null, label: "No recurrence" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export default function RecurrenceSelector({
  value,
  onChange,
  endDate,
  onEndDateChange,
}: RecurrenceSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-600 flex items-center gap-2">
          <Repeat size={14} />
          Recurrence
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {recurrenceOptions.map((option) => (
          <button
            key={option.value || "none"}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              value === option.value
                ? "bg-indigo-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {value && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-500">End date (optional):</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={endDate ? new Date(endDate).toISOString().split("T")[0] : ""}
              onChange={(e) =>
                onEndDateChange(e.target.value ? new Date(e.target.value) : undefined)
              }
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {endDate && (
              <button
                type="button"
                onClick={() => onEndDateChange(undefined)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Clear end date"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {value && (
        <p className="text-xs text-slate-400">
          When you complete this task, a new instance will be created{" "}
          {value === "daily" && "for the next day"}
          {value === "weekly" && "for the same day next week"}
          {value === "monthly" && "for the same day next month"}
          {endDate && `, until ${new Date(endDate).toLocaleDateString()}`}.
        </p>
      )}
    </div>
  );
}
