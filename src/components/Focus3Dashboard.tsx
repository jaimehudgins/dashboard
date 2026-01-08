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
import TagBadge from "./TagBadge";
import EnergyTracker from "./EnergyTracker";

const priorityConfig: Record<
  Priority,
  { color: string; bg: string; label: string }
> = {
  critical: { color: "text-red-600", bg: "bg-red-50", label: "Critical" },
  high: { color: "text-orange-600", bg: "bg-orange-50", label: "High" },
  medium: { color: "text-yellow-600", bg: "bg-yellow-50", label: "Medium" },
  low: { color: "text-slate-500", bg: "bg-slate-100", label: "Low" },
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
    <div className="group relative bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all">
      {/* Rank Badge */}
      <div className="absolute -top-3 -left-3 w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg">
        {rank}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 pr-4">
          <h3 className="text-slate-900 font-medium leading-snug">
            {task.title}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: project?.color }}
            />
            <span className="text-xs text-slate-500">{project?.name}</span>
          </div>
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${priority.bg} ${priority.color}`}
        >
          {priority.label}
        </span>
      </div>

      {/* Tags */}
      {task.tagIds && task.tagIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.tagIds.map((tagId) => {
            const tag = state.tags.find((t) => t.id === tagId);
            if (!tag) return null;
            return <TagBadge key={tag.id} tag={tag} />;
          })}
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
        {task.dueDate && (
          <div
            className={`flex items-center gap-1 ${isOverdue ? "text-red-500" : ""}`}
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
            <Flame size={12} className="text-orange-500" />
            <span>{task.focusMinutes}m focused</span>
          </div>
        )}
        {task.status === "in_progress" && (
          <span className="text-indigo-600 font-medium">In Progress</span>
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
          className="flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          aria-label="Edit task"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onComplete(task)}
          className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-green-500 text-slate-600 hover:text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
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
          <h1 className="text-2xl font-bold text-slate-900">Command Center</h1>
          <p className="text-slate-500 mt-1">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="flex items-center gap-4">
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Clock size={12} />
              Focus Time
            </div>
            <div className="text-xl font-bold text-slate-900">
              {focusMinutes}m
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Target size={12} />
              Momentum
            </div>
            <div className="text-xl font-bold text-indigo-600">{momentum}%</div>
          </div>
        </div>
      </div>

      {/* Focus 3 Section */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Target className="text-indigo-500" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Focus 3</h2>
            <p className="text-sm text-slate-500">
              Your highest-priority tasks right now
            </p>
          </div>
        </div>

        {focus3.length === 0 ? (
          <div className="bg-white border border-slate-200 border-dashed rounded-xl p-8 text-center">
            <CheckCircle2 className="mx-auto text-green-500 mb-3" size={32} />
            <h3 className="text-slate-900 font-medium mb-1">All caught up!</h3>
            <p className="text-sm text-slate-500">
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

      {/* Energy Tracker */}
      <EnergyTracker />

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        {state.projects.map((project) => {
          const projectTasks = state.tasks.filter(
            (t) => t.projectId === project.id && t.status !== "completed",
          );
          return (
            <div
              key={project.id}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="text-sm font-medium text-slate-900 truncate">
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
