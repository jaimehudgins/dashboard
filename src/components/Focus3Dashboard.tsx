"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  Clock,
  Play,
  CheckCircle2,
  Flame,
  Target,
  Pencil,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task, Priority } from "@/types";
import TaskEditModal from "./TaskEditModal";

const priorityConfig: Record<
  Priority,
  { color: string; bg: string; label: string }
> = {
  critical: { color: "text-red-400", bg: "bg-red-500/10", label: "Critical" },
  high: { color: "text-orange-400", bg: "bg-orange-500/10", label: "High" },
  medium: { color: "text-yellow-400", bg: "bg-yellow-500/10", label: "Medium" },
  low: { color: "text-slate-400", bg: "bg-slate-500/10", label: "Low" },
};

interface Focus3CardProps {
  task: Task;
  rank: number;
  onStartFocus: (task: Task) => void;
  onComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
}

function Focus3Card({
  task,
  rank,
  onStartFocus,
  onComplete,
  onEdit,
}: Focus3CardProps) {
  const { state } = useApp();
  const project = state.projects.find((p) => p.id === task.projectId);
  const priority = priorityConfig[task.priority];
  const isOverdue =
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    new Date(task.dueDate).toDateString() !== new Date().toDateString();

  return (
    <div className="group relative bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-indigo-500/50 transition-all">
      {/* Rank Badge */}
      <div className="absolute -top-3 -left-3 w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg">
        {rank}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 pr-4">
          <h3 className="text-white font-medium leading-snug">{task.title}</h3>
          <div className="flex items-center gap-2 mt-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: project?.color }}
            />
            <span className="text-xs text-slate-400">{project?.name}</span>
          </div>
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${priority.bg} ${priority.color}`}
        >
          {priority.label}
        </span>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
        {task.dueDate && (
          <div
            className={`flex items-center gap-1 ${isOverdue ? "text-red-400" : ""}`}
          >
            {isOverdue ? <AlertCircle size={12} /> : <Clock size={12} />}
            <span>
              {isOverdue ? "Overdue: " : "Due: "}
              {format(new Date(task.dueDate), "MMM d")}
            </span>
          </div>
        )}
        {task.focusMinutes > 0 && (
          <div className="flex items-center gap-1">
            <Flame size={12} className="text-orange-400" />
            <span>{task.focusMinutes}m focused</span>
          </div>
        )}
        {task.status === "in_progress" && (
          <span className="text-indigo-400 font-medium">In Progress</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onStartFocus(task)}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          aria-label="Start focus session"
        >
          <Play size={14} />
          Start Focus
        </button>
        <button
          onClick={() => onEdit(task)}
          className="flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          aria-label="Edit task"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onComplete(task)}
          className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-green-600 text-slate-300 hover:text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          aria-label="Complete task"
        >
          <CheckCircle2 size={14} />
        </button>
      </div>
    </div>
  );
}

interface Focus3DashboardProps {
  onStartFocus: (task: Task) => void;
}

export default function Focus3Dashboard({
  onStartFocus,
}: Focus3DashboardProps) {
  const {
    state,
    dispatch,
    getFocus3Tasks,
    getTodayFocusMinutes,
    getMomentumScore,
  } = useApp();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const focus3 = getFocus3Tasks();
  const focusMinutes = getTodayFocusMinutes();
  const momentum = getMomentumScore();

  const handleComplete = (task: Task) => {
    dispatch({
      type: "UPDATE_TASK",
      payload: { ...task, status: "completed" },
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Command Center</h1>
          <p className="text-slate-400 mt-1">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="flex items-center gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-5 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Clock size={12} />
              Focus Time
            </div>
            <div className="text-xl font-bold text-white">{focusMinutes}m</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-5 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Target size={12} />
              Momentum
            </div>
            <div className="text-xl font-bold text-indigo-400">{momentum}%</div>
          </div>
        </div>
      </div>

      {/* Focus 3 Section */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
            <Target className="text-indigo-400" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Focus 3</h2>
            <p className="text-sm text-slate-400">
              Your highest-priority tasks right now
            </p>
          </div>
        </div>

        {focus3.length === 0 ? (
          <div className="bg-slate-800/30 border border-slate-700 border-dashed rounded-xl p-8 text-center">
            <CheckCircle2 className="mx-auto text-green-400 mb-3" size={32} />
            <h3 className="text-white font-medium mb-1">All caught up!</h3>
            <p className="text-sm text-slate-400">
              No priority tasks pending. Great work!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {focus3.map((task, index) => (
              <Focus3Card
                key={task.id}
                task={task}
                rank={index + 1}
                onStartFocus={onStartFocus}
                onComplete={handleComplete}
                onEdit={setEditingTask}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        {state.projects.map((project) => {
          const projectTasks = state.tasks.filter(
            (t) => t.projectId === project.id && t.status !== "completed",
          );
          return (
            <div
              key={project.id}
              className="bg-slate-800/30 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="text-sm font-medium text-white truncate">
                  {project.name}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{projectTasks.length} active tasks</span>
                <span>{project.totalFocusMinutes}m focused</span>
              </div>
            </div>
          );
        })}
      </div>

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
