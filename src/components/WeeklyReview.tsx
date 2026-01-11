"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Folder,
  Target,
  Award,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, isWithinInterval, eachDayOfInterval } from "date-fns";
import { useApp } from "@/store/store";
import { Task, Priority } from "@/types";

export default function WeeklyReview() {
  const { state } = useApp();
  const [weekOffset, setWeekOffset] = useState(0);

  // Calculate the week range
  const currentDate = new Date();
  const targetDate = weekOffset === 0 ? currentDate : (weekOffset < 0 ? subWeeks(currentDate, Math.abs(weekOffset)) : addWeeks(currentDate, weekOffset));
  const weekStart = startOfWeek(targetDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1 }); // Sunday

  // Get completed tasks for the week
  const completedTasks = useMemo(() => {
    return state.tasks.filter((task) => {
      if (task.status !== "completed" || !task.completedAt) return false;
      const completedDate = new Date(task.completedAt);
      return isWithinInterval(completedDate, { start: weekStart, end: weekEnd });
    });
  }, [state.tasks, weekStart, weekEnd]);

  // Get focus sessions for the week
  const weekFocusSessions = useMemo(() => {
    return state.focusSessions.filter((session) => {
      const sessionDate = new Date(session.startTime);
      return isWithinInterval(sessionDate, { start: weekStart, end: weekEnd });
    });
  }, [state.focusSessions, weekStart, weekEnd]);

  // Calculate stats
  const totalFocusMinutes = weekFocusSessions.reduce((acc, s) => acc + s.minutes, 0);
  const totalTasksCompleted = completedTasks.length;
  const criticalTasksCompleted = completedTasks.filter((t) => t.priority === "critical").length;
  const highTasksCompleted = completedTasks.filter((t) => t.priority === "high").length;

  // Group completed tasks by project
  const tasksByProject = useMemo(() => {
    const grouped: Record<string, { projectName: string; projectColor: string; tasks: Task[] }> = {};

    completedTasks.forEach((task) => {
      const projectId = task.projectId || "misc";
      if (!grouped[projectId]) {
        const project = state.projects.find((p) => p.id === projectId);
        grouped[projectId] = {
          projectName: project?.name || "Misc Tasks",
          projectColor: project?.color || "#6366f1",
          tasks: [],
        };
      }
      grouped[projectId].tasks.push(task);
    });

    return Object.values(grouped).sort((a, b) => b.tasks.length - a.tasks.length);
  }, [completedTasks, state.projects]);

  // Daily breakdown
  const dailyStats = useMemo(() => {
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    return days.map((day) => {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      const dayTasks = completedTasks.filter((t) => {
        const completed = new Date(t.completedAt!);
        return completed >= dayStart && completed <= dayEnd;
      });

      const dayFocus = weekFocusSessions
        .filter((s) => {
          const sessionDate = new Date(s.startTime);
          return sessionDate >= dayStart && sessionDate <= dayEnd;
        })
        .reduce((acc, s) => acc + s.minutes, 0);

      return {
        date: day,
        tasksCompleted: dayTasks.length,
        focusMinutes: dayFocus,
      };
    });
  }, [completedTasks, weekFocusSessions, weekStart, weekEnd]);

  const formatHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const getPriorityBadge = (priority: Priority) => {
    const config: Record<Priority, { bg: string; text: string }> = {
      critical: { bg: "bg-red-100", text: "text-red-700" },
      high: { bg: "bg-orange-100", text: "text-orange-700" },
      medium: { bg: "bg-yellow-100", text: "text-yellow-700" },
      low: { bg: "bg-slate-100", text: "text-slate-600" },
    };
    return config[priority];
  };

  const isCurrentWeek = weekOffset === 0;

  return (
    <div className="space-y-6">
      {/* Header with Week Navigation */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Weekly Review</h2>
          <p className="text-slate-500 mt-1">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
            {isCurrentWeek && <span className="ml-2 text-indigo-500 font-medium">(This Week)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((prev) => prev - 1)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Previous week"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={isCurrentWeek}
            className="px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:text-slate-400 disabled:hover:bg-transparent rounded-lg transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset((prev) => prev + 1)}
            disabled={weekOffset >= 0}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:text-slate-200 disabled:hover:bg-transparent rounded-lg transition-colors"
            title="Next week"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle2 size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{totalTasksCompleted}</p>
              <p className="text-sm text-slate-500">Tasks Completed</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Clock size={20} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{formatHours(totalFocusMinutes)}</p>
              <p className="text-sm text-slate-500">Focus Time</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Target size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{criticalTasksCompleted}</p>
              <p className="text-sm text-slate-500">Critical Tasks</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Flame size={20} className="text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{highTasksCompleted}</p>
              <p className="text-sm text-slate-500">High Priority</p>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Calendar size={18} />
          Daily Breakdown
        </h3>
        <div className="grid grid-cols-7 gap-3">
          {dailyStats.map((day, index) => (
            <div
              key={index}
              className={`text-center p-3 rounded-lg ${
                day.tasksCompleted > 0 || day.focusMinutes > 0
                  ? "bg-indigo-50"
                  : "bg-slate-50"
              }`}
            >
              <p className="text-xs font-medium text-slate-500 mb-1">
                {format(day.date, "EEE")}
              </p>
              <p className="text-sm text-slate-400 mb-2">{format(day.date, "d")}</p>
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <CheckCircle2 size={12} className="text-green-500" />
                  <span className="text-sm font-medium text-slate-700">
                    {day.tasksCompleted}
                  </span>
                </div>
                {day.focusMinutes > 0 && (
                  <div className="flex items-center justify-center gap-1">
                    <Clock size={12} className="text-indigo-500" />
                    <span className="text-xs text-slate-500">
                      {formatHours(day.focusMinutes)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Accomplishments by Project */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Award size={18} />
          Accomplishments
        </h3>

        {tasksByProject.length === 0 ? (
          <p className="text-slate-400 text-center py-8">
            No tasks completed this week. Keep going!
          </p>
        ) : (
          <div className="space-y-6">
            {tasksByProject.map((group) => (
              <div key={group.projectName}>
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: group.projectColor }}
                  />
                  <h4 className="font-medium text-slate-900">{group.projectName}</h4>
                  <span className="text-sm text-slate-400">
                    ({group.tasks.length} tasks)
                  </span>
                </div>
                <ul className="space-y-2 ml-5">
                  {group.tasks.map((task) => (
                    <li key={task.id} className="flex items-start gap-2">
                      <CheckCircle2
                        size={16}
                        className="text-green-500 mt-0.5 flex-shrink-0"
                      />
                      <span className="text-sm text-slate-700">{task.title}</span>
                      {task.priority !== "medium" && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            getPriorityBadge(task.priority).bg
                          } ${getPriorityBadge(task.priority).text}`}
                        >
                          {task.priority}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
