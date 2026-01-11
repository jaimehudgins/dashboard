"use client";

import React, { useState, useMemo } from "react";
import {
  format,
  subDays,
  isSameDay,
  startOfDay,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  subMonths,
  addMonths,
  isToday,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import {
  Battery,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  BarChart3,
  Lightbulb,
  X,
  MessageSquare,
  Clock,
  CheckCircle2,
  Flame,
  Bell,
} from "lucide-react";
import { useApp } from "@/store/store";
import { EnergyLog, EnergyTimeSlot } from "@/types";

const TIME_SLOTS: { id: EnergyTimeSlot; label: string; time: string }[] = [
  { id: "morning", label: "Morning", time: "6-10am" },
  { id: "midday", label: "Midday", time: "11am-1pm" },
  { id: "afternoon", label: "Afternoon", time: "2-5pm" },
  { id: "evening", label: "Evening", time: "6-9pm" },
];

const ENERGY_LEVELS = [
  {
    level: 1,
    emoji: "😴",
    label: "Exhausted",
    color: "bg-red-500",
    hex: "#ef4444",
  },
  {
    level: 2,
    emoji: "😕",
    label: "Low",
    color: "bg-orange-500",
    hex: "#f97316",
  },
  {
    level: 3,
    emoji: "😐",
    label: "Okay",
    color: "bg-yellow-500",
    hex: "#eab308",
  },
  {
    level: 4,
    emoji: "🙂",
    label: "Good",
    color: "bg-lime-500",
    hex: "#84cc16",
  },
  {
    level: 5,
    emoji: "⚡",
    label: "Energized",
    color: "bg-green-500",
    hex: "#22c55e",
  },
];

type ViewMode = "today" | "week" | "month" | "insights";

export default function EnergyTracker() {
  const { state, dispatch } = useApp();
  const [selectedSlot, setSelectedSlot] = useState<EnergyTimeSlot | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  const today = startOfDay(new Date());

  // Get logs for a specific date
  const getLogsForDate = (date: Date): EnergyLog[] => {
    return state.energyLogs.filter((log) =>
      isSameDay(new Date(log.date), date),
    );
  };

  // Get today's logs
  const todayLogs = useMemo(
    () => getLogsForDate(today),
    [state.energyLogs, today],
  );

  // Get log for a specific time slot on a date
  const getLogForSlot = (
    slot: EnergyTimeSlot,
    date: Date = today,
  ): EnergyLog | undefined => {
    return state.energyLogs.find(
      (log) => log.timeSlot === slot && isSameDay(new Date(log.date), date),
    );
  };

  // Get last 7 days of data
  const last7Days = useMemo(() => {
    const days: { date: Date; logs: EnergyLog[]; avgLevel: number | null }[] =
      [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const dayLogs = getLogsForDate(date);
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

  // Calculate trend
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
      thisWeekLogs.reduce((sum, log) => sum + log.level, 0) /
      thisWeekLogs.length;
    const lastWeekAvg =
      lastWeekLogs.reduce((sum, log) => sum + log.level, 0) /
      lastWeekLogs.length;

    const diff = thisWeekAvg - lastWeekAvg;
    if (diff > 0.3) return "up";
    if (diff < -0.3) return "down";
    return "stable";
  }, [state.energyLogs, today]);

  // Calendar month data
  const calendarData = useMemo(() => {
    const targetMonth =
      monthOffset === 0
        ? today
        : monthOffset < 0
          ? subMonths(today, Math.abs(monthOffset))
          : addMonths(today, monthOffset);
    const monthStart = startOfMonth(targetMonth);
    const monthEnd = endOfMonth(targetMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return {
      month: targetMonth,
      days: days.map((date) => {
        const dayLogs = getLogsForDate(date);
        const avgLevel =
          dayLogs.length > 0
            ? dayLogs.reduce((sum, log) => sum + log.level, 0) / dayLogs.length
            : null;
        return { date, logs: dayLogs, avgLevel };
      }),
      startPadding: getDay(monthStart), // 0 = Sunday
    };
  }, [state.energyLogs, monthOffset, today]);

  // Correlation insights
  const insights = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => subDays(today, i));

    // Average energy by time slot
    const slotAverages: Record<
      EnergyTimeSlot,
      { total: number; count: number }
    > = {
      morning: { total: 0, count: 0 },
      midday: { total: 0, count: 0 },
      afternoon: { total: 0, count: 0 },
      evening: { total: 0, count: 0 },
    };

    state.energyLogs.forEach((log) => {
      const logDate = new Date(log.date);
      if (logDate >= subDays(today, 30)) {
        slotAverages[log.timeSlot].total += log.level;
        slotAverages[log.timeSlot].count += 1;
      }
    });

    const bestTimeSlot = Object.entries(slotAverages)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => b[1].total / b[1].count - a[1].total / a[1].count)[0];

    const worstTimeSlot = Object.entries(slotAverages)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => a[1].total / a[1].count - b[1].total / b[1].count)[0];

    // Average energy by day of week
    const dayOfWeekAverages: Record<number, { total: number; count: number }> =
      {};
    for (let i = 0; i < 7; i++) dayOfWeekAverages[i] = { total: 0, count: 0 };

    state.energyLogs.forEach((log) => {
      const logDate = new Date(log.date);
      if (logDate >= subDays(today, 30)) {
        const dow = getDay(logDate);
        dayOfWeekAverages[dow].total += log.level;
        dayOfWeekAverages[dow].count += 1;
      }
    });

    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const bestDay = Object.entries(dayOfWeekAverages)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => b[1].total / b[1].count - a[1].total / a[1].count)[0];

    const worstDay = Object.entries(dayOfWeekAverages)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => a[1].total / a[1].count - b[1].total / b[1].count)[0];

    // Correlate with task completion
    const highEnergyDays: Date[] = [];
    const lowEnergyDays: Date[] = [];

    last30Days.forEach((date) => {
      const dayLogs = getLogsForDate(date);
      if (dayLogs.length > 0) {
        const avg =
          dayLogs.reduce((sum, log) => sum + log.level, 0) / dayLogs.length;
        if (avg >= 4) highEnergyDays.push(date);
        else if (avg <= 2) lowEnergyDays.push(date);
      }
    });

    const highEnergyTaskCount = state.tasks.filter((task) => {
      if (!task.completedAt) return false;
      return highEnergyDays.some((d) =>
        isSameDay(new Date(task.completedAt!), d),
      );
    }).length;

    const lowEnergyTaskCount = state.tasks.filter((task) => {
      if (!task.completedAt) return false;
      return lowEnergyDays.some((d) =>
        isSameDay(new Date(task.completedAt!), d),
      );
    }).length;

    const highEnergyAvgTasks =
      highEnergyDays.length > 0
        ? highEnergyTaskCount / highEnergyDays.length
        : 0;
    const lowEnergyAvgTasks =
      lowEnergyDays.length > 0 ? lowEnergyTaskCount / lowEnergyDays.length : 0;

    // Focus session correlation
    const highEnergyFocusMinutes = state.focusSessions
      .filter((session) =>
        highEnergyDays.some((d) => isSameDay(new Date(session.startTime), d)),
      )
      .reduce((sum, s) => sum + s.minutes, 0);

    const lowEnergyFocusMinutes = state.focusSessions
      .filter((session) =>
        lowEnergyDays.some((d) => isSameDay(new Date(session.startTime), d)),
      )
      .reduce((sum, s) => sum + s.minutes, 0);

    const highEnergyAvgFocus =
      highEnergyDays.length > 0
        ? highEnergyFocusMinutes / highEnergyDays.length
        : 0;
    const lowEnergyAvgFocus =
      lowEnergyDays.length > 0
        ? lowEnergyFocusMinutes / lowEnergyDays.length
        : 0;

    return {
      bestTimeSlot: bestTimeSlot
        ? {
            slot: bestTimeSlot[0] as EnergyTimeSlot,
            avg: bestTimeSlot[1].total / bestTimeSlot[1].count,
          }
        : null,
      worstTimeSlot: worstTimeSlot
        ? {
            slot: worstTimeSlot[0] as EnergyTimeSlot,
            avg: worstTimeSlot[1].total / worstTimeSlot[1].count,
          }
        : null,
      bestDay: bestDay
        ? {
            day: dayNames[parseInt(bestDay[0])],
            avg: bestDay[1].total / bestDay[1].count,
          }
        : null,
      worstDay: worstDay
        ? {
            day: dayNames[parseInt(worstDay[0])],
            avg: worstDay[1].total / worstDay[1].count,
          }
        : null,
      taskCorrelation: {
        highEnergyAvg: highEnergyAvgTasks,
        lowEnergyAvg: lowEnergyAvgTasks,
        difference: highEnergyAvgTasks - lowEnergyAvgTasks,
        percentMore:
          lowEnergyAvgTasks > 0
            ? Math.round(
                ((highEnergyAvgTasks - lowEnergyAvgTasks) / lowEnergyAvgTasks) *
                  100,
              )
            : null,
      },
      focusCorrelation: {
        highEnergyAvg: highEnergyAvgFocus,
        lowEnergyAvg: lowEnergyAvgFocus,
        difference: highEnergyAvgFocus - lowEnergyAvgFocus,
      },
    };
  }, [state.energyLogs, state.tasks, state.focusSessions, today]);

  // Handle logging energy
  const handleLogEnergy = (
    slot: EnergyTimeSlot,
    level: number,
    date: Date = today,
  ) => {
    const existingLog = getLogForSlot(slot, date);

    if (existingLog) {
      dispatch({
        type: "UPDATE_ENERGY_LOG",
        payload: { ...existingLog, level },
      });
    } else {
      const newLog: EnergyLog = {
        id: `energy-${Date.now()}`,
        date: date,
        timeSlot: slot,
        level,
        createdAt: new Date(),
      };
      dispatch({ type: "ADD_ENERGY_LOG", payload: newLog });
    }
    setSelectedSlot(null);
  };

  // Handle adding/updating note
  const handleSaveNote = (logId: string) => {
    const log = state.energyLogs.find((l) => l.id === logId);
    if (log) {
      dispatch({
        type: "UPDATE_ENERGY_LOG",
        payload: { ...log, note: noteText.trim() || undefined },
      });
    }
    setEditingLogId(null);
    setNoteText("");
    setShowNoteInput(false);
  };

  // Determine current time slot
  const getCurrentTimeSlot = (): EnergyTimeSlot => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 11) return "morning";
    if (hour >= 11 && hour < 14) return "midday";
    if (hour >= 14 && hour < 18) return "afternoon";
    return "evening";
  };

  const currentSlot = getCurrentTimeSlot();

  // Get color for energy level
  const getEnergyColor = (level: number | null): string => {
    if (level === null) return "#e2e8f0";
    const energyInfo = ENERGY_LEVELS.find((e) => e.level === Math.round(level));
    return energyInfo?.hex || "#e2e8f0";
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Battery className="text-green-500" size={20} />
          Energy Tracker
        </h3>
        <div className="flex items-center gap-2">
          {weeklyAvg !== null && viewMode === "today" && (
            <div className="flex items-center gap-1 text-sm text-slate-500 mr-2">
              <span>{weeklyAvg.toFixed(1)}/5</span>
              {trend === "up" && (
                <TrendingUp size={14} className="text-green-500" />
              )}
              {trend === "down" && (
                <TrendingDown size={14} className="text-red-500" />
              )}
              {trend === "stable" && (
                <Minus size={14} className="text-slate-400" />
              )}
            </div>
          )}
          {/* View Mode Tabs */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("today")}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                viewMode === "today"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                viewMode === "week"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                viewMode === "month"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode("insights")}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                viewMode === "insights"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              <Lightbulb size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Date Display */}
      {viewMode === "today" && (
        <div className="text-sm text-slate-500 mb-3">
          {format(today, "EEEE, MMMM d, yyyy")}
        </div>
      )}

      {/* TODAY VIEW */}
      {viewMode === "today" && (
        <>
          {/* Time Slots */}
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
                  onClick={() =>
                    setSelectedSlot(selectedSlot === slot.id ? null : slot.id)
                  }
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
                  {log?.note && (
                    <div className="absolute -bottom-1 -right-1">
                      <MessageSquare size={12} className="text-indigo-500" />
                    </div>
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
              <div className="flex justify-between gap-2 mb-3">
                {ENERGY_LEVELS.map((energy) => {
                  const currentLog = getLogForSlot(selectedSlot);
                  return (
                    <button
                      key={energy.level}
                      onClick={() =>
                        handleLogEnergy(selectedSlot, energy.level)
                      }
                      className={`flex-1 p-2 rounded-lg border-2 transition-all hover:scale-105 ${
                        currentLog?.level === energy.level
                          ? "border-indigo-500 bg-white shadow-sm"
                          : "border-transparent hover:border-slate-200"
                      }`}
                      title={energy.label}
                    >
                      <div className="text-2xl mb-1">{energy.emoji}</div>
                      <div className="text-xs text-slate-500">
                        {energy.level}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Note Input */}
              {getLogForSlot(selectedSlot) && (
                <div className="border-t border-slate-200 pt-3 mt-2">
                  {showNoteInput || getLogForSlot(selectedSlot)?.note ? (
                    <div className="space-y-2">
                      <textarea
                        value={
                          noteText || getLogForSlot(selectedSlot)?.note || ""
                        }
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Add a note (sleep, meals, stress, etc.)..."
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        rows={2}
                        onFocus={() => {
                          setEditingLogId(getLogForSlot(selectedSlot)!.id);
                          if (!noteText)
                            setNoteText(
                              getLogForSlot(selectedSlot)?.note || "",
                            );
                        }}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setShowNoteInput(false);
                            setNoteText("");
                          }}
                          className="text-xs text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() =>
                            handleSaveNote(getLogForSlot(selectedSlot)!.id)
                          }
                          className="text-xs bg-indigo-500 text-white px-3 py-1 rounded-lg hover:bg-indigo-600"
                        >
                          Save Note
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNoteInput(true)}
                      className="text-xs text-slate-500 hover:text-indigo-500 flex items-center gap-1"
                    >
                      <MessageSquare size={12} />
                      Add note
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 7-Day Chart with Dates */}
          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs text-slate-500 mb-2">Last 7 days</div>
            <div className="flex items-end justify-between gap-1 h-20">
              {last7Days.map((day, i) => {
                const height = day.avgLevel
                  ? `${(day.avgLevel / 5) * 100}%`
                  : "0%";
                const isCurrentDay = isSameDay(day.date, today);

                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <div className="w-full h-12 bg-slate-100 rounded-sm relative overflow-hidden">
                      {day.avgLevel && (
                        <div
                          className="absolute bottom-0 w-full rounded-sm transition-all"
                          style={{
                            height,
                            backgroundColor: getEnergyColor(day.avgLevel),
                          }}
                        />
                      )}
                    </div>
                    <div
                      className={`text-xs ${isCurrentDay ? "text-indigo-600 font-medium" : "text-slate-400"}`}
                    >
                      {format(day.date, "EEE")}
                    </div>
                    <div
                      className={`text-xs ${isCurrentDay ? "text-indigo-500" : "text-slate-300"}`}
                    >
                      {format(day.date, "d")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Today's Stats */}
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
        </>
      )}

      {/* WEEK VIEW */}
      {viewMode === "week" && (
        <div className="space-y-3">
          <div className="text-sm text-slate-500 mb-2">
            {format(startOfWeek(today, { weekStartsOn: 1 }), "MMM d")} -{" "}
            {format(endOfWeek(today, { weekStartsOn: 1 }), "MMM d, yyyy")}
          </div>

          {/* Week Grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-slate-500 font-medium pb-2"></th>
                  {last7Days.map((day, i) => (
                    <th
                      key={i}
                      className={`text-center font-medium pb-2 ${
                        isSameDay(day.date, today)
                          ? "text-indigo-600"
                          : "text-slate-500"
                      }`}
                    >
                      <div>{format(day.date, "EEE")}</div>
                      <div className="text-slate-400 font-normal">
                        {format(day.date, "M/d")}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map((slot) => (
                  <tr key={slot.id}>
                    <td className="text-slate-500 pr-2 py-1">{slot.label}</td>
                    {last7Days.map((day, i) => {
                      const log = getLogForSlot(slot.id, day.date);
                      const energyInfo = log
                        ? ENERGY_LEVELS.find((e) => e.level === log.level)
                        : null;
                      const isCurrentSlotToday =
                        isSameDay(day.date, today) && slot.id === currentSlot;

                      return (
                        <td key={i} className="text-center py-1">
                          <button
                            onClick={() => {
                              setSelectedDate(day.date);
                              setSelectedSlot(slot.id);
                            }}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-all ${
                              log
                                ? "hover:ring-2 hover:ring-indigo-300"
                                : isCurrentSlotToday
                                  ? "border-2 border-dashed border-indigo-300 animate-pulse"
                                  : "border border-dashed border-slate-200 hover:border-slate-300"
                            }`}
                            style={
                              log
                                ? {
                                    backgroundColor: `${getEnergyColor(log.level)}20`,
                                  }
                                : {}
                            }
                          >
                            {log ? (
                              <span className="text-lg">
                                {energyInfo?.emoji}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Selected slot editor for week view */}
          {selectedSlot && selectedDate && (
            <div className="p-3 bg-slate-50 rounded-lg mt-3">
              <div className="text-sm text-slate-600 mb-2">
                {format(selectedDate, "EEEE, MMM d")} -{" "}
                {TIME_SLOTS.find((s) => s.id === selectedSlot)?.label}
              </div>
              <div className="flex justify-between gap-2">
                {ENERGY_LEVELS.map((energy) => {
                  const currentLog = getLogForSlot(selectedSlot, selectedDate);
                  return (
                    <button
                      key={energy.level}
                      onClick={() => {
                        handleLogEnergy(
                          selectedSlot,
                          energy.level,
                          selectedDate,
                        );
                        setSelectedDate(null);
                      }}
                      className={`flex-1 p-2 rounded-lg border-2 transition-all hover:scale-105 ${
                        currentLog?.level === energy.level
                          ? "border-indigo-500 bg-white shadow-sm"
                          : "border-transparent hover:border-slate-200"
                      }`}
                    >
                      <div className="text-xl">{energy.emoji}</div>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => {
                  setSelectedSlot(null);
                  setSelectedDate(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-700 mt-2"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Week Summary */}
          <div className="border-t border-slate-100 pt-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Week average:</span>
                <span className="ml-2 font-medium text-slate-900">
                  {weeklyAvg?.toFixed(1) || "—"} / 5
                </span>
              </div>
              <div>
                <span className="text-slate-500">Best day:</span>
                <span className="ml-2 font-medium text-slate-900">
                  {last7Days
                    .filter((d) => d.avgLevel)
                    .sort((a, b) => (b.avgLevel || 0) - (a.avgLevel || 0))[0]
                    ? format(
                        last7Days
                          .filter((d) => d.avgLevel)
                          .sort(
                            (a, b) => (b.avgLevel || 0) - (a.avgLevel || 0),
                          )[0].date,
                        "EEE",
                      )
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MONTH VIEW */}
      {viewMode === "month" && (
        <div className="space-y-3">
          {/* Month Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setMonthOffset((prev) => prev - 1)}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-medium text-slate-700">
              {format(calendarData.month, "MMMM yyyy")}
            </span>
            <button
              onClick={() => setMonthOffset((prev) => prev + 1)}
              disabled={monthOffset >= 0}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 rounded transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Calendar Heatmap */}
          <div className="grid grid-cols-7 gap-1">
            {/* Day headers */}
            {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
              <div key={i} className="text-center text-xs text-slate-400 py-1">
                {day}
              </div>
            ))}

            {/* Padding for start of month */}
            {Array.from({ length: calendarData.startPadding }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}

            {/* Calendar days */}
            {calendarData.days.map((day, i) => {
              const isCurrentDay = isToday(day.date);
              return (
                <button
                  key={i}
                  onClick={() =>
                    setSelectedDate(
                      selectedDate && isSameDay(selectedDate, day.date)
                        ? null
                        : day.date,
                    )
                  }
                  className={`aspect-square rounded-lg flex items-center justify-center text-xs transition-all ${
                    selectedDate && isSameDay(selectedDate, day.date)
                      ? "ring-2 ring-indigo-500"
                      : ""
                  } ${isCurrentDay ? "ring-2 ring-indigo-300" : ""}`}
                  style={{
                    backgroundColor: day.avgLevel
                      ? getEnergyColor(day.avgLevel)
                      : "#f1f5f9",
                    color:
                      day.avgLevel && day.avgLevel >= 3 ? "white" : "#64748b",
                  }}
                  title={
                    day.avgLevel ? `Avg: ${day.avgLevel.toFixed(1)}` : "No data"
                  }
                >
                  {format(day.date, "d")}
                </button>
              );
            })}
          </div>

          {/* Selected Date Details */}
          {selectedDate && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  {format(selectedDate, "EEEE, MMMM d")}
                </span>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {TIME_SLOTS.map((slot) => {
                  const log = getLogForSlot(slot.id, selectedDate);
                  const energyInfo = log
                    ? ENERGY_LEVELS.find((e) => e.level === log.level)
                    : null;

                  return (
                    <div
                      key={slot.id}
                      className="text-center p-2 bg-white rounded-lg border border-slate-200"
                    >
                      <div className="text-xs text-slate-500 mb-1">
                        {slot.label}
                      </div>
                      <div className="text-xl">
                        {log ? energyInfo?.emoji : "—"}
                      </div>
                      {log?.note && (
                        <div
                          className="text-xs text-slate-400 mt-1 truncate"
                          title={log.note}
                        >
                          {log.note}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <span>Low</span>
            {ENERGY_LEVELS.map((level) => (
              <div
                key={level.level}
                className="w-4 h-4 rounded"
                style={{ backgroundColor: level.hex }}
                title={level.label}
              />
            ))}
            <span>High</span>
          </div>
        </div>
      )}

      {/* INSIGHTS VIEW */}
      {viewMode === "insights" && (
        <div className="space-y-4">
          <div className="text-sm text-slate-500 mb-2">
            Based on last 30 days
          </div>

          {/* Best/Worst Times */}
          <div className="grid grid-cols-2 gap-3">
            {insights.bestTimeSlot && (
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-xs text-green-600 font-medium mb-1">
                  Peak Energy Time
                </div>
                <div className="text-lg font-semibold text-green-700">
                  {
                    TIME_SLOTS.find((s) => s.id === insights.bestTimeSlot!.slot)
                      ?.label
                  }
                </div>
                <div className="text-xs text-green-600">
                  Avg: {insights.bestTimeSlot.avg.toFixed(1)}/5
                </div>
              </div>
            )}
            {insights.worstTimeSlot && (
              <div className="p-3 bg-orange-50 rounded-lg">
                <div className="text-xs text-orange-600 font-medium mb-1">
                  Low Energy Time
                </div>
                <div className="text-lg font-semibold text-orange-700">
                  {
                    TIME_SLOTS.find(
                      (s) => s.id === insights.worstTimeSlot!.slot,
                    )?.label
                  }
                </div>
                <div className="text-xs text-orange-600">
                  Avg: {insights.worstTimeSlot.avg.toFixed(1)}/5
                </div>
              </div>
            )}
          </div>

          {/* Best/Worst Days */}
          <div className="grid grid-cols-2 gap-3">
            {insights.bestDay && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
                  <TrendingUp size={12} className="text-green-500" />
                  Best Day
                </div>
                <div className="text-sm font-medium text-slate-700">
                  {insights.bestDay.day}s
                </div>
                <div className="text-xs text-slate-500">
                  Avg: {insights.bestDay.avg.toFixed(1)}/5
                </div>
              </div>
            )}
            {insights.worstDay && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
                  <TrendingDown size={12} className="text-red-500" />
                  Lowest Day
                </div>
                <div className="text-sm font-medium text-slate-700">
                  {insights.worstDay.day}s
                </div>
                <div className="text-xs text-slate-500">
                  Avg: {insights.worstDay.avg.toFixed(1)}/5
                </div>
              </div>
            )}
          </div>

          {/* Productivity Correlation */}
          <div className="p-3 bg-indigo-50 rounded-lg">
            <div className="text-xs text-indigo-600 font-medium mb-2 flex items-center gap-1">
              <CheckCircle2 size={12} />
              Energy vs Task Completion
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-500">High energy days:</div>
                <div className="font-medium text-slate-700">
                  {insights.taskCorrelation.highEnergyAvg.toFixed(1)} tasks/day
                </div>
              </div>
              <div>
                <div className="text-slate-500">Low energy days:</div>
                <div className="font-medium text-slate-700">
                  {insights.taskCorrelation.lowEnergyAvg.toFixed(1)} tasks/day
                </div>
              </div>
            </div>
            {insights.taskCorrelation.percentMore !== null &&
              insights.taskCorrelation.percentMore > 0 && (
                <div className="text-xs text-indigo-700 mt-2 font-medium">
                  You complete {insights.taskCorrelation.percentMore}% more
                  tasks on high-energy days!
                </div>
              )}
          </div>

          {/* Focus Time Correlation */}
          <div className="p-3 bg-orange-50 rounded-lg">
            <div className="text-xs text-orange-600 font-medium mb-2 flex items-center gap-1">
              <Flame size={12} />
              Energy vs Focus Time
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-500">High energy days:</div>
                <div className="font-medium text-slate-700">
                  {Math.round(insights.focusCorrelation.highEnergyAvg)}m avg
                </div>
              </div>
              <div>
                <div className="text-slate-500">Low energy days:</div>
                <div className="font-medium text-slate-700">
                  {Math.round(insights.focusCorrelation.lowEnergyAvg)}m avg
                </div>
              </div>
            </div>
          </div>

          {/* Tips */}
          {insights.bestTimeSlot && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
                <Lightbulb size={12} className="text-yellow-500" />
                Suggestion
              </div>
              <div className="text-sm text-slate-700">
                Schedule your most important tasks during{" "}
                <span className="font-medium">
                  {TIME_SLOTS.find(
                    (s) => s.id === insights.bestTimeSlot!.slot,
                  )?.label.toLowerCase()}
                </span>{" "}
                when your energy is highest.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
