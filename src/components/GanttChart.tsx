"use client";

import React, { useMemo, useState } from "react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  differenceInDays,
  startOfDay,
  addWeeks,
  isSameDay,
} from "date-fns";
import { ChevronDown, ChevronRight, Flag } from "lucide-react";
import { useApp } from "@/store/store";
import { Task, Milestone } from "@/types";

interface GanttChartProps {
  projectId: string;
  onEditTask: (task: Task) => void;
}

const priorityColors: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-slate-400",
};

export default function GanttChart({ projectId, onEditTask }: GanttChartProps) {
  const { state } = useApp();
  const [collapsedMilestones, setCollapsedMilestones] = useState<Set<string>>(
    new Set(),
  );

  // Get tasks and milestones for this project
  const tasks = state.tasks.filter(
    (t) => t.projectId === projectId && !t.parentTaskId,
  );
  const milestones = state.milestones.filter((m) => m.projectId === projectId);

  // Toggle milestone collapse
  const toggleMilestone = (milestoneId: string) => {
    setCollapsedMilestones((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(milestoneId)) {
        newSet.delete(milestoneId);
      } else {
        newSet.add(milestoneId);
      }
      return newSet;
    });
  };

  // Calculate date range (4 weeks from today, or expand to include all tasks)
  const today = startOfDay(new Date());
  const defaultStart = startOfWeek(today, { weekStartsOn: 1 });
  const defaultEnd = addWeeks(defaultStart, 4);

  const dateRange = useMemo(() => {
    let minDate = defaultStart;
    let maxDate = defaultEnd;

    // Expand range to include all task due dates
    tasks.forEach((task) => {
      if (task.dueDate) {
        const dueDate = startOfDay(new Date(task.dueDate));
        if (dueDate < minDate)
          minDate = startOfWeek(dueDate, { weekStartsOn: 1 });
        if (dueDate > maxDate)
          maxDate = endOfWeek(dueDate, { weekStartsOn: 1 });
      }
    });

    // Expand range to include milestone due dates
    milestones.forEach((milestone) => {
      if (milestone.dueDate) {
        const dueDate = startOfDay(new Date(milestone.dueDate));
        if (dueDate < minDate)
          minDate = startOfWeek(dueDate, { weekStartsOn: 1 });
        if (dueDate > maxDate)
          maxDate = endOfWeek(dueDate, { weekStartsOn: 1 });
      }
    });

    return { start: minDate, end: maxDate };
  }, [tasks, milestones]);

  // Generate array of days for the header
  const days = useMemo(() => {
    const result: Date[] = [];
    let current = dateRange.start;
    while (current <= dateRange.end) {
      result.push(current);
      current = addDays(current, 1);
    }
    return result;
  }, [dateRange]);

  // Group days by week for header
  const weeks = useMemo(() => {
    const result: { start: Date; days: Date[] }[] = [];
    let currentWeek: Date[] = [];
    let weekStart = days[0];

    days.forEach((day, index) => {
      if (index === 0 || day.getDay() === 1) {
        if (currentWeek.length > 0) {
          result.push({ start: weekStart, days: currentWeek });
        }
        currentWeek = [day];
        weekStart = day;
      } else {
        currentWeek.push(day);
      }
    });

    if (currentWeek.length > 0) {
      result.push({ start: weekStart, days: currentWeek });
    }

    return result;
  }, [days]);

  const totalDays = differenceInDays(dateRange.end, dateRange.start) + 1;
  const dayWidth = 32; // pixels per day

  // Group tasks by milestone
  const tasksByMilestone = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    const unassigned: Task[] = [];

    tasks.forEach((task) => {
      if (task.milestoneId) {
        if (!grouped[task.milestoneId]) {
          grouped[task.milestoneId] = [];
        }
        grouped[task.milestoneId].push(task);
      } else {
        unassigned.push(task);
      }
    });

    // Sort tasks within each group by due date
    Object.values(grouped).forEach((taskList) => {
      taskList.sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    });

    unassigned.sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    return { grouped, unassigned };
  }, [tasks]);

  // Sort milestones by due date
  const sortedMilestones = useMemo(() => {
    return [...milestones].sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
  }, [milestones]);

  const getTaskPosition = (task: Task) => {
    if (!task.dueDate) return null;
    const dueDate = startOfDay(new Date(task.dueDate));
    const dayOffset = differenceInDays(dueDate, dateRange.start);

    // Task spans from creation to due date (or just the due date if created recently)
    const createdDate = startOfDay(new Date(task.createdAt));
    const startOffset = Math.max(
      0,
      differenceInDays(createdDate, dateRange.start),
    );
    const endOffset = dayOffset;

    // Minimum width of 1 day
    const width = Math.max(1, endOffset - startOffset + 1);

    return {
      left: startOffset * dayWidth,
      width: width * dayWidth - 4,
    };
  };

  const getMilestonePosition = (milestone: Milestone) => {
    if (!milestone.dueDate) return null;
    const dueDate = startOfDay(new Date(milestone.dueDate));
    const dayOffset = differenceInDays(dueDate, dateRange.start);

    return {
      left: dayOffset * dayWidth + dayWidth / 2 - 8,
    };
  };

  const todayOffset =
    differenceInDays(today, dateRange.start) * dayWidth + dayWidth / 2;

  // Render a task row
  const renderTaskRow = (task: Task, isNested: boolean = false) => {
    const position = getTaskPosition(task);

    return (
      <div
        key={task.id}
        className="flex border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={() => onEditTask(task)}
      >
        <div
          className={`w-[220px] flex-shrink-0 px-4 py-2 border-r border-slate-200 ${
            isNested ? "pl-10" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[task.priority]}`}
            />
            <span
              className={`text-sm truncate ${
                task.status === "completed"
                  ? "text-slate-400 line-through"
                  : "text-slate-900"
              }`}
            >
              {task.title}
            </span>
          </div>
        </div>
        <div className="relative flex-1" style={{ height: 36 }}>
          {/* Today line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 z-10"
            style={{ left: todayOffset }}
          />
          {position && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 h-6 rounded ${
                task.status === "completed"
                  ? "bg-green-200"
                  : priorityColors[task.priority]
              } opacity-80 hover:opacity-100 transition-opacity`}
              style={{
                left: position.left,
                width: position.width,
              }}
              title={`${task.title} - Due: ${format(new Date(task.dueDate!), "MMM d, yyyy")}`}
            />
          )}
          {!task.dueDate && (
            <div className="absolute top-1/2 -translate-y-1/2 left-4 text-xs text-slate-400 italic">
              No due date
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex">
        {/* Fixed left column */}
        <div className="w-[220px] flex-shrink-0 bg-white z-20 border-r border-slate-200">
          {/* Header */}
          <div className="border-b border-slate-200 bg-slate-50">
            <div className="px-4 py-2 font-medium text-sm text-slate-600 h-[32px] flex items-center">
              Task / Milestone
            </div>
            <div className="h-[28px]" /> {/* Spacer for day headers */}
          </div>

          {/* Milestone rows with nested tasks */}
          {sortedMilestones.map((milestone) => {
            const milestoneTasks = tasksByMilestone.grouped[milestone.id] || [];
            const isCollapsed = collapsedMilestones.has(milestone.id);

            return (
              <React.Fragment key={milestone.id}>
                {/* Milestone header */}
                <div
                  className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => toggleMilestone(milestone.id)}
                >
                  <button className="text-slate-400">
                    {isCollapsed ? (
                      <ChevronRight size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                  <Flag size={12} className="text-indigo-500 flex-shrink-0" />
                  <span
                    className={`text-sm font-medium truncate ${
                      milestone.status === "completed"
                        ? "text-green-600 line-through"
                        : "text-slate-900"
                    }`}
                  >
                    {milestone.name}
                  </span>
                  <span className="text-xs text-slate-400 ml-auto">
                    {milestoneTasks.length}
                  </span>
                </div>

                {/* Nested tasks */}
                {!isCollapsed &&
                  milestoneTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 pl-10 pr-4 py-2 border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => onEditTask(task)}
                    >
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[task.priority]}`}
                      />
                      <span
                        className={`text-sm truncate ${
                          task.status === "completed"
                            ? "text-slate-400 line-through"
                            : "text-slate-900"
                        }`}
                      >
                        {task.title}
                      </span>
                    </div>
                  ))}
              </React.Fragment>
            );
          })}

          {/* Unassigned tasks section */}
          {tasksByMilestone.unassigned.length > 0 && (
            <>
              <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
                <span className="text-sm font-medium text-slate-600">
                  Project Tasks
                </span>
              </div>
              {tasksByMilestone.unassigned.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => onEditTask(task)}
                >
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[task.priority]}`}
                  />
                  <span
                    className={`text-sm truncate ${
                      task.status === "completed"
                        ? "text-slate-400 line-through"
                        : "text-slate-900"
                    }`}
                  >
                    {task.title}
                  </span>
                </div>
              ))}
            </>
          )}

          {/* Empty state */}
          {sortedMilestones.length === 0 &&
            tasksByMilestone.unassigned.length === 0 && (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">
                No tasks or milestones
              </div>
            )}
        </div>

        {/* Scrollable timeline */}
        <div className="flex-1 overflow-x-auto">
          <div style={{ minWidth: totalDays * dayWidth }}>
            {/* Header */}
            <div className="border-b border-slate-200 bg-slate-50 sticky top-0">
              {/* Week headers */}
              <div className="flex h-[32px]">
                {weeks.map((week, i) => (
                  <div
                    key={i}
                    className="text-center text-xs font-medium text-slate-600 flex items-center justify-center border-r border-slate-100"
                    style={{ width: week.days.length * dayWidth }}
                  >
                    {format(week.start, "MMM d")} -{" "}
                    {format(addDays(week.start, week.days.length - 1), "MMM d")}
                  </div>
                ))}
              </div>
              {/* Day headers */}
              <div className="flex h-[28px]">
                {days.map((day, i) => (
                  <div
                    key={i}
                    className={`text-center text-xs flex items-center justify-center border-r border-slate-100 ${
                      isSameDay(day, today)
                        ? "bg-indigo-100 text-indigo-700 font-medium"
                        : day.getDay() === 0 || day.getDay() === 6
                          ? "bg-slate-100 text-slate-400"
                          : "text-slate-500"
                    }`}
                    style={{ width: dayWidth }}
                  >
                    {format(day, "d")}
                  </div>
                ))}
              </div>
            </div>

            {/* Milestone rows with nested tasks - timeline side */}
            {sortedMilestones.map((milestone) => {
              const milestoneTasks =
                tasksByMilestone.grouped[milestone.id] || [];
              const isCollapsed = collapsedMilestones.has(milestone.id);
              const position = getMilestonePosition(milestone);

              return (
                <React.Fragment key={milestone.id}>
                  {/* Milestone timeline row */}
                  <div
                    className="relative border-b border-slate-100"
                    style={{ height: 36 }}
                  >
                    {/* Today line */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 z-10"
                      style={{ left: todayOffset }}
                    />
                    {position && (
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rotate-45 z-20 ${
                          milestone.status === "completed"
                            ? "bg-green-500"
                            : "bg-indigo-500"
                        }`}
                        style={{ left: position.left }}
                        title={`${milestone.name} - ${format(new Date(milestone.dueDate!), "MMM d, yyyy")}`}
                      />
                    )}
                  </div>

                  {/* Nested task timeline rows */}
                  {!isCollapsed &&
                    milestoneTasks.map((task) => {
                      const taskPosition = getTaskPosition(task);
                      return (
                        <div
                          key={task.id}
                          className="relative border-b border-slate-100"
                          style={{ height: 36 }}
                        >
                          {/* Today line */}
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 z-10"
                            style={{ left: todayOffset }}
                          />
                          {taskPosition && (
                            <div
                              className={`absolute top-1/2 -translate-y-1/2 h-6 rounded ${
                                task.status === "completed"
                                  ? "bg-green-200"
                                  : priorityColors[task.priority]
                              } opacity-80 hover:opacity-100 transition-opacity cursor-pointer`}
                              style={{
                                left: taskPosition.left,
                                width: taskPosition.width,
                              }}
                              title={`${task.title} - Due: ${format(new Date(task.dueDate!), "MMM d, yyyy")}`}
                              onClick={() => onEditTask(task)}
                            />
                          )}
                          {!task.dueDate && (
                            <div className="absolute top-1/2 -translate-y-1/2 left-4 text-xs text-slate-400 italic">
                              No due date
                            </div>
                          )}
                        </div>
                      );
                    })}
                </React.Fragment>
              );
            })}

            {/* Unassigned tasks - timeline side */}
            {tasksByMilestone.unassigned.length > 0 && (
              <>
                {/* Header row spacer */}
                <div
                  className="border-b border-slate-100 bg-slate-50"
                  style={{ height: 36 }}
                />
                {tasksByMilestone.unassigned.map((task) => {
                  const taskPosition = getTaskPosition(task);
                  return (
                    <div
                      key={task.id}
                      className="relative border-b border-slate-100"
                      style={{ height: 36 }}
                    >
                      {/* Today line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 z-10"
                        style={{ left: todayOffset }}
                      />
                      {taskPosition && (
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 h-6 rounded ${
                            task.status === "completed"
                              ? "bg-green-200"
                              : priorityColors[task.priority]
                          } opacity-80 hover:opacity-100 transition-opacity cursor-pointer`}
                          style={{
                            left: taskPosition.left,
                            width: taskPosition.width,
                          }}
                          title={`${task.title} - Due: ${format(new Date(task.dueDate!), "MMM d, yyyy")}`}
                          onClick={() => onEditTask(task)}
                        />
                      )}
                      {!task.dueDate && (
                        <div className="absolute top-1/2 -translate-y-1/2 left-4 text-xs text-slate-400 italic">
                          No due date
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="border-t border-slate-200 px-4 py-2 bg-slate-50 flex items-center gap-6 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-indigo-500 rotate-45" />
          <span>Milestone</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-4 bg-indigo-400" />
          <span>Today</span>
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>Critical</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span>High</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-slate-400" />
            <span>Low</span>
          </div>
        </div>
      </div>
    </div>
  );
}
