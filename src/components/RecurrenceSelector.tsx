"use client";

import React from "react";
import { Repeat, X } from "lucide-react";
import { RecurrenceRule } from "@/types";

interface RecurrenceSelectorProps {
  value: RecurrenceRule;
  onChange: (value: RecurrenceRule) => void;
  endDate?: Date;
  onEndDateChange: (date: Date | undefined) => void;
  daysOfWeek?: number[];
  onDaysOfWeekChange?: (days: number[]) => void;
}

const recurrenceOptions: { value: RecurrenceRule; label: string }[] = [
  { value: null, label: "No recurrence" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every other week" },
  { value: "monthly", label: "Monthly" },
];

const dayLabels = [
  { value: 0, short: "S", full: "Sun" },
  { value: 1, short: "M", full: "Mon" },
  { value: 2, short: "T", full: "Tue" },
  { value: 3, short: "W", full: "Wed" },
  { value: 4, short: "T", full: "Thu" },
  { value: 5, short: "F", full: "Fri" },
  { value: 6, short: "S", full: "Sat" },
];

export default function RecurrenceSelector({
  value,
  onChange,
  endDate,
  onEndDateChange,
  daysOfWeek = [],
  onDaysOfWeekChange,
}: RecurrenceSelectorProps) {
  const showDaysSelector =
    (value === "weekly" || value === "biweekly") && !!onDaysOfWeekChange;

  const toggleDay = (day: number) => {
    if (!onDaysOfWeekChange) return;
    if (daysOfWeek.includes(day)) {
      onDaysOfWeekChange(daysOfWeek.filter((d) => d !== day));
    } else {
      onDaysOfWeekChange([...daysOfWeek, day].sort((a, b) => a - b));
    }
  };

  const selectedDayNames = daysOfWeek
    .slice()
    .sort((a, b) => a - b)
    .map((d) => dayLabels[d].full)
    .join(", ");

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

      {showDaysSelector && (
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">
            Days of week
          </label>
          <div className="flex gap-1">
            {dayLabels.map((day) => {
              const isSelected = daysOfWeek.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                    isSelected
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  title={day.full}
                  aria-pressed={isSelected}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {value && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-500">
            End date{value === "weekly" || value === "biweekly" ? "" : " (optional)"}:
          </label>
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
          {(value === "weekly" || value === "biweekly") && daysOfWeek.length > 0 ? (
            <>
              All instances will be created upfront, occurring on{" "}
              {selectedDayNames}{" "}
              {value === "biweekly" ? "every other week" : "every week"}
              {endDate
                ? ` until ${new Date(endDate).toLocaleDateString()}.`
                : ". Set an end date to generate instances."}
            </>
          ) : value === "weekly" || value === "biweekly" ? (
            <>Select at least one day of the week.</>
          ) : (
            <>
              When you complete this task, a new instance will be created{" "}
              {value === "daily" && "for the next day"}
              {value === "monthly" && "for the same day next month"}
              {endDate && `, until ${new Date(endDate).toLocaleDateString()}`}.
            </>
          )}
        </p>
      )}
    </div>
  );
}
