"use client";

import React, { useState, useMemo } from "react";
import { format, subDays, isSameDay, startOfDay } from "date-fns";
import { Battery, BatteryLow, BatteryMedium, BatteryFull, Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useApp } from "@/store/store";
import { EnergyLog, EnergyTimeSlot } from "@/types";

const TIME_SLOTS: { id: EnergyTimeSlot; label: string; time: string }[] = [
  { id: "morning", label: "Morning", time: "6-10am" },
  { id: "midday", label: "Midday", time: "11am-1pm" },
  { id: "afternoon", label: "Afternoon", time: "2-5pm" },
  { id: "evening", label: "Evening", time: "6-9pm" },
];

const ENERGY_LEVELS = [
  { level: 1, emoji: "😴", label: "Exhausted", color: "bg-red-500" },
  { level: 2, emoji: "😕", label: "Low", color: "bg-orange-500" },
  { level: 3, emoji: "😐", label: "Okay", color: "bg-yellow-500" },
  { level: 4, emoji: "🙂", label: "Good", color: "bg-lime-500" },
  { level: 5, emoji: "⚡", label: "Energized", color: "bg-green-500" },
];

export default function EnergyTracker() {
  const { state, dispatch } = useApp();
  const [selectedSlot, setSelectedSlot] = useState<EnergyTimeSlot | null>(null);

  const today = startOfDay(new Date());

  // Get today's logs
  const todayLogs = useMemo(() => {
    return state.energyLogs.filter((log) =>
      isSameDay(new Date(log.date), today)
    );
  }, [state.energyLogs, today]);

  // Get log for a specific time slot today
  const getLogForSlot = (slot: EnergyTimeSlot): EnergyLog | undefined => {
    return todayLogs.find((log) => log.timeSlot === slot);
  };

  // Get last 7 days of data for the mini chart
  const last7Days = useMemo(() => {
    const days: { date: Date; logs: EnergyLog[]; avgLevel: number | null }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const dayLogs = state.energyLogs.filter((log) =>
        isSameDay(new Date(log.date), date)
      );
      const avgLevel =
        dayLogs.length > 0
          ? dayLogs.reduce((sum, log) => sum + log.level, 0) / dayLogs.length
          : null;
      days.push({ date, logs: dayLogs, avgLevel });
    }
    return days;
  }, [state.energyLogs, today]);

  // Calculate weekly average
  const weeklyAvg = useMemo(() => {
    const allLogs = last7Days.flatMap((d) => d.logs);
    if (allLogs.length === 0) return null;
    return allLogs.reduce((sum, log) => sum + log.level, 0) / allLogs.length;
  }, [last7Days]);

  // Calculate trend (comparing this week to last week)
  const trend = useMemo(() => {
    const thisWeekLogs = state.energyLogs.filter((log) => {
      const logDate = new Date(log.date);
      return logDate >= subDays(today, 7) && logDate <= today;
    });
    const lastWeekLogs = state.energyLogs.filter((log) => {
      const logDate = new Date(log.date);
      return logDate >= subDays(today, 14) && logDate < subDays(today, 7);
    });

    if (thisWeekLogs.length === 0 || lastWeekLogs.length === 0) return null;

    const thisWeekAvg =
      thisWeekLogs.reduce((sum, log) => sum + log.level, 0) / thisWeekLogs.length;
    const lastWeekAvg =
      lastWeekLogs.reduce((sum, log) => sum + log.level, 0) / lastWeekLogs.length;

    const diff = thisWeekAvg - lastWeekAvg;
    if (diff > 0.3) return "up";
    if (diff < -0.3) return "down";
    return "stable";
  }, [state.energyLogs, today]);

  // Handle logging energy
  const handleLogEnergy = (slot: EnergyTimeSlot, level: number) => {
    const existingLog = getLogForSlot(slot);

    if (existingLog) {
      // Update existing log
      dispatch({
        type: "UPDATE_ENERGY_LOG",
        payload: { ...existingLog, level },
      });
    } else {
      // Create new log
      const newLog: EnergyLog = {
        id: `energy-${Date.now()}`,
        date: today,
        timeSlot: slot,
        level,
        createdAt: new Date(),
      };
      dispatch({ type: "ADD_ENERGY_LOG", payload: newLog });
    }
    setSelectedSlot(null);
  };

  // Determine current time slot based on time of day
  const getCurrentTimeSlot = (): EnergyTimeSlot => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 11) return "morning";
    if (hour >= 11 && hour < 14) return "midday";
    if (hour >= 14 && hour < 18) return "afternoon";
    return "evening";
  };

  const currentSlot = getCurrentTimeSlot();

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Battery className="text-green-500" size={20} />
          Energy Tracker
        </h3>
        {weeklyAvg !== null && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Week avg: {weeklyAvg.toFixed(1)}</span>
            {trend === "up" && (
              <TrendingUp size={16} className="text-green-500" />
            )}
            {trend === "down" && (
              <TrendingDown size={16} className="text-red-500" />
            )}
            {trend === "stable" && (
              <Minus size={16} className="text-slate-400" />
            )}
          </div>
        )}
      </div>

      {/* Today's Time Slots */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {TIME_SLOTS.map((slot) => {
          const log = getLogForSlot(slot.id);
          const isCurrentSlot = slot.id === currentSlot;
          const energyInfo = log
            ? ENERGY_LEVELS.find((e) => e.level === log.level)
            : null;

          return (
            <button
              key={slot.id}
              onClick={() => setSelectedSlot(selectedSlot === slot.id ? null : slot.id)}
              className={`relative p-3 rounded-lg border-2 transition-all ${
                selectedSlot === slot.id
                  ? "border-indigo-500 bg-indigo-50"
                  : isCurrentSlot && !log
                    ? "border-indigo-300 bg-indigo-50/50 animate-pulse"
                    : log
                      ? "border-slate-200 bg-slate-50"
                      : "border-dashed border-slate-300 hover:border-slate-400"
              }`}
            >
              <div className="text-xs font-medium text-slate-600 mb-1">
                {slot.label}
              </div>
              {log ? (
                <div className="text-2xl">{energyInfo?.emoji}</div>
              ) : (
                <div className="text-2xl text-slate-300">?</div>
              )}
              <div className="text-xs text-slate-400 mt-1">{slot.time}</div>
              {isCurrentSlot && !log && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Energy Level Selector */}
      {selectedSlot && (
        <div className="mb-4 p-3 bg-slate-50 rounded-lg">
          <div className="text-sm text-slate-600 mb-2">
            How&apos;s your energy for{" "}
            <span className="font-medium">
              {TIME_SLOTS.find((s) => s.id === selectedSlot)?.label}
            </span>
            ?
          </div>
          <div className="flex justify-between gap-2">
            {ENERGY_LEVELS.map((energy) => (
              <button
                key={energy.level}
                onClick={() => handleLogEnergy(selectedSlot, energy.level)}
                className={`flex-1 p-2 rounded-lg border-2 transition-all hover:scale-105 ${
                  getLogForSlot(selectedSlot)?.level === energy.level
                    ? "border-indigo-500 bg-white shadow-sm"
                    : "border-transparent hover:border-slate-200"
                }`}
                title={energy.label}
              >
                <div className="text-2xl mb-1">{energy.emoji}</div>
                <div className="text-xs text-slate-500">{energy.level}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 7-Day Mini Chart */}
      <div className="border-t border-slate-100 pt-3">
        <div className="text-xs text-slate-500 mb-2">Last 7 days</div>
        <div className="flex items-end justify-between gap-1 h-16">
          {last7Days.map((day, i) => {
            const height = day.avgLevel
              ? `${(day.avgLevel / 5) * 100}%`
              : "0%";
            const isToday = isSameDay(day.date, today);

            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <div className="w-full h-12 bg-slate-100 rounded-sm relative overflow-hidden">
                  {day.avgLevel && (
                    <div
                      className={`absolute bottom-0 w-full rounded-sm transition-all ${
                        isToday ? "bg-indigo-500" : "bg-slate-400"
                      }`}
                      style={{ height }}
                    />
                  )}
                </div>
                <div
                  className={`text-xs ${
                    isToday ? "text-indigo-600 font-medium" : "text-slate-400"
                  }`}
                >
                  {format(day.date, "EEE").charAt(0)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Stats */}
      {todayLogs.length > 0 && (
        <div className="border-t border-slate-100 pt-3 mt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Today&apos;s average:</span>
            <span className="font-medium text-slate-900">
              {(
                todayLogs.reduce((sum, log) => sum + log.level, 0) /
                todayLogs.length
              ).toFixed(1)}{" "}
              / 5
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
