"use client";

import React, { useState, useMemo } from "react";
import {
  AlertCircle,
  Clock,
  Play,
  CheckCircle2,
  Pencil,
  Circle,
  Calendar,
  ListTodo,
  Inbox,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task, Priority } from "@/types";
import { format, startOfDay } from "date-fns";
import TaskEditModal from "./TaskEditModal";

interface AllTasksProps {
  onFocusTask?: (task: Task) => void;
}

export default function AllTasks({ onFocusTask }: AllTasksProps) {
  const { state, dispatch } = useApp();
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Get active tasks (not completed, not subtasks)
  const activeTasks = useMemo(() => {
    return state.tasks.filter(
      (t) => t.status !== "completed" && !t.parentTaskId
    );
  }, [state.tasks]);

  // Group tasks by work area
  const tasksByWorkArea = useMemo(() => {
    const groups = new Map<string, Task[]>();

    // Initialize groups for all work areas
    state.workAreas.forEach((wa) => {
      groups.set(wa.id, []);
    });

    // Add "unassigned" group
    groups.set("unassigned", []);

    // Distribute tasks
    activeTasks.forEach((task) => {
      if (task.workAreaId && groups.has(task.workAreaId)) {
        groups.get(task.workAreaId)!.push(task);
      } else {
        groups.get("unassigned")!.push(task);
      }
    });

    // Sort tasks within each group by due date
    groups.forEach((tasks) => {
      tasks.sort((a, b) => {
        // Tasks with due dates come first
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;

        // Both have due dates - sort by date
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }

        // Neither has due date - sort by priority
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    });

    return groups;
  }, [activeTasks, state.workAreas]);

  const handleComplete = (task: Task) => {
    dispatch({
      type: "UPDATE_TASK",
      payload: { ...task, status: "completed" },
    });
  };

  const handleFocus = (task: Task) => {
    if (onFocusTask) {
      onFocusTask(task);
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case "critical":
        return "text-red-600 bg-red-50";
      case "high":
        return "text-orange-600 bg-orange-50";
      case "medium":
        return "text-yellow-600 bg-yellow-50";
      case "low":
        return "text-slate-600 bg-slate-50";
    }
  };

  const isOverdue = (task: Task) => {
    if (!task.dueDate) return false;
    const today = startOfDay(new Date());
    const dueDate = startOfDay(new Date(task.dueDate));
    return dueDate < today;
  };

  const renderTaskCard = (task: Task) => {
    const project = state.projects.find((p) => p.id === task.projectId);
    const taskIsOverdue = isOverdue(task);

    return (
      <div
        key={task.id}
        className="bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-start gap-2">
          {/* Complete Button */}
          <button
            onClick={() => handleComplete(task)}
            className="flex-shrink-0 mt-0.5 text-slate-400 hover:text-green-500 transition-colors"
          >
            <Circle size={16} />
          </button>

          {/* Task Content */}
          <div className="flex-1 min-w-0">
            {/* Title and Priority */}
            <div className="flex items-start gap-2 mb-1">
              <h4 className="text-sm font-medium text-slate-900 flex-1 line-clamp-2">
                {task.title}
              </h4>
              <span
                className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${getPriorityColor(
                  task.priority
                )}`}
              >
                {task.priority.charAt(0).toUpperCase()}
              </span>
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
              {project && (
                <span className="flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  {project.name}
                </span>
              )}

              {task.dueDate && (
                <span
                  className={`flex items-center gap-1 ${
                    taskIsOverdue ? "text-red-500 font-medium" : ""
                  }`}
                >
                  {taskIsOverdue ? (
                    <AlertCircle size={10} />
                  ) : (
                    <Calendar size={10} />
                  )}
                  {format(new Date(task.dueDate), "MMM d")}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleFocus(task)}
                className="flex items-center gap-1 px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-xs font-medium transition-colors"
              >
                <Play size={10} />
                Focus
              </button>
              <button
                onClick={() => setEditingTask(task)}
                className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
              >
                <Pencil size={10} />
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWorkAreaCard = (
    workAreaId: string,
    name: string,
    color: string,
    icon: React.ReactNode
  ) => {
    const tasks = tasksByWorkArea.get(workAreaId) || [];

    return (
      <div
        key={workAreaId}
        className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
      >
        {/* Header */}
        <div
          className="px-4 py-3 border-b border-slate-200"
          style={{ backgroundColor: `${color}15` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: color }}
              >
                {icon}
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">{name}</h3>
                <p className="text-xs text-slate-500">{tasks.length} tasks</p>
              </div>
            </div>
          </div>
        </div>

        {/* Task List - Fixed Height with Scroll */}
        <div className="h-96 overflow-y-auto p-3">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <CheckCircle2 size={32} className="mb-2" />
              <p className="text-sm">All caught up!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => renderTaskCard(task))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
          <ListTodo className="text-indigo-500" size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">All Tasks</h2>
          <p className="text-sm text-slate-500">
            {activeTasks.length} active task{activeTasks.length !== 1 ? "s" : ""} across all work areas
          </p>
        </div>
      </div>

      {/* Work Area Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Render each work area */}
        {state.workAreas.map((workArea) =>
          renderWorkAreaCard(
            workArea.id,
            workArea.name,
            workArea.color,
            <div className="w-full h-full" />
          )
        )}

        {/* Unassigned Tasks */}
        {renderWorkAreaCard(
          "unassigned",
          "Unassigned",
          "#94a3b8",
          <Inbox className="text-white" size={16} />
        )}
      </div>

      {/* Task Edit Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
