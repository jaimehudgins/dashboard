"use client";

import React, { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, Clock, Flame, Flag } from "lucide-react";
import { useApp } from "@/store/store";
import { Task, Priority, Milestone } from "@/types";

interface CalendarViewProps {
  projectId: string;
  onEditTask: (task: Task) => void;
}

const priorityColors: Record<Priority, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-slate-400",
};

export default function CalendarView({
  projectId,
  onEditTask,
}: CalendarViewProps) {
  const { state } = useApp();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Get tasks for this project with due dates, excluding subtasks
  const projectTasks = state.tasks.filter(
    (t) => t.projectId === projectId && t.dueDate && !t.parentTaskId,
  );

  // Get milestones for this project with due dates
  const projectMilestones = state.milestones.filter(
    (m) => m.projectId === projectId && m.dueDate,
  );

  // Build calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  // Group tasks by date
  const tasksByDate: Record<string, Task[]> = {};
  projectTasks.forEach((task) => {
    if (task.dueDate) {
      const dateKey = format(new Date(task.dueDate), "yyyy-MM-dd");
      if (!tasksByDate[dateKey]) {
        tasksByDate[dateKey] = [];
      }
      tasksByDate[dateKey].push(task);
    }
  });

  // Group milestones by date
  const milestonesByDate: Record<string, Milestone[]> = {};
  projectMilestones.forEach((milestone) => {
    if (milestone.dueDate) {
      const dateKey = format(new Date(milestone.dueDate), "yyyy-MM-dd");
      if (!milestonesByDate[dateKey]) {
        milestonesByDate[dateKey] = [];
      }
      milestonesByDate[dateKey].push(milestone);
    }
  });

  const previousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={previousMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={20} className="text-slate-600" />
          </button>
          <h3 className="text-lg font-semibold text-slate-900 ml-2">
            {format(currentMonth, "MMMM yyyy")}
          </h3>
        </div>
        <button
          onClick={goToToday}
          className="text-sm text-indigo-500 hover:text-indigo-600 font-medium"
        >
          Today
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-slate-500 py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayTasks = tasksByDate[dateKey] || [];
          const dayMilestones = milestonesByDate[dateKey] || [];
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isDayToday = isToday(day);

          return (
            <div
              key={dateKey}
              className={`min-h-[100px] p-1 rounded-lg border transition-colors ${
                isCurrentMonth
                  ? "bg-white border-slate-200"
                  : "bg-slate-50 border-slate-100"
              } ${isDayToday ? "ring-2 ring-indigo-500" : ""}`}
            >
              <div
                className={`text-right text-sm mb-1 ${
                  isDayToday
                    ? "text-indigo-600 font-bold"
                    : isCurrentMonth
                      ? "text-slate-900"
                      : "text-slate-400"
                }`}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {/* Milestones first */}
                {dayMilestones.map((milestone) => (
                  <div
                    key={milestone.id}
                    className={`w-full text-left text-xs p-1 rounded truncate flex items-center gap-1 ${
                      milestone.status === "completed"
                        ? "bg-green-100 text-green-700 line-through"
                        : "bg-indigo-100 text-indigo-700 border border-indigo-200"
                    }`}
                    title={milestone.name}
                  >
                    <Flag size={10} />
                    {milestone.name}
                  </div>
                ))}
                {dayTasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onEditTask(task)}
                    className={`w-full text-left text-xs p-1 rounded truncate transition-colors hover:opacity-80 ${
                      task.status === "completed"
                        ? "bg-green-100 text-green-700 line-through"
                        : `${priorityColors[task.priority]} text-white`
                    }`}
                    title={task.title}
                  >
                    {task.title}
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-xs text-slate-400 text-center">
                    +{dayTasks.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center flex-wrap gap-4 pt-2 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-indigo-100 border border-indigo-200 flex items-center justify-center">
            <Flag size={6} className="text-indigo-700" />
          </div>
          Milestone
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500" />
          Critical
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-orange-500" />
          High
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-500" />
          Medium
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-slate-400" />
          Low
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-300" />
          Completed
        </div>
      </div>
    </div>
  );
}
