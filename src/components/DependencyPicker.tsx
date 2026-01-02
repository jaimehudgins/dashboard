"use client";

import React, { useState } from "react";
import { Plus, X, Link2, AlertTriangle } from "lucide-react";
import { useApp } from "@/store/store";
import { Task, TaskDependency } from "@/types";

interface DependencyPickerProps {
  taskId: string;
  projectId: string;
}

export default function DependencyPicker({
  taskId,
  projectId,
}: DependencyPickerProps) {
  const { state, dispatch, getTaskDependencies, isTaskBlocked } = useApp();
  const [showPicker, setShowPicker] = useState(false);

  // Get current dependencies for this task
  const dependencies = getTaskDependencies(taskId);

  // Get all tasks in the same project that could be dependencies (excluding self and subtasks)
  const availableTasks = state.tasks.filter(
    (t) =>
      t.projectId === projectId &&
      t.id !== taskId &&
      !t.parentTaskId && // Exclude subtasks
      t.status !== "completed" && // Only incomplete tasks can block
      !dependencies.some((d) => d.dependsOnTaskId === t.id), // Not already a dependency
  );

  // Get the actual tasks that this task depends on
  const blockingTasks = dependencies
    .map((dep) => state.tasks.find((t) => t.id === dep.dependsOnTaskId))
    .filter((t): t is Task => t !== undefined);

  const handleAddDependency = (dependsOnTaskId: string) => {
    const newDependency: TaskDependency = {
      id: `dep-${Date.now()}`,
      taskId,
      dependsOnTaskId,
      createdAt: new Date(),
    };
    dispatch({ type: "ADD_DEPENDENCY", payload: newDependency });
    setShowPicker(false);
  };

  const handleRemoveDependency = (dependencyId: string) => {
    dispatch({ type: "DELETE_DEPENDENCY", payload: dependencyId });
  };

  const isBlocked = isTaskBlocked(taskId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-600 flex items-center gap-2">
          <Link2 size={14} />
          Dependencies
          {isBlocked && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <AlertTriangle size={12} />
              Blocked
            </span>
          )}
        </label>
      </div>

      {/* Current dependencies */}
      {blockingTasks.length > 0 && (
        <div className="space-y-1">
          {blockingTasks.map((blockingTask) => {
            const dependency = dependencies.find(
              (d) => d.dependsOnTaskId === blockingTask.id,
            );
            if (!dependency) return null;

            return (
              <div
                key={dependency.id}
                className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 group"
              >
                <span className="text-xs text-slate-500">Blocked by:</span>
                <span className="flex-1 text-sm text-slate-700 truncate">
                  {blockingTask.title}
                </span>
                {blockingTask.status === "completed" && (
                  <span className="text-xs text-green-500">Done</span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveDependency(dependency.id)}
                  className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  aria-label="Remove dependency"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add dependency */}
      {showPicker ? (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <p className="text-xs text-slate-500">
              Select a task that must be completed first:
            </p>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {availableTasks.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                No available tasks to add as dependencies
              </p>
            ) : (
              availableTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => handleAddDependency(task.id)}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-b-0"
                >
                  {task.title}
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="w-full text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-500 transition-colors"
        >
          <Plus size={16} />
          Add dependency
        </button>
      )}
    </div>
  );
}
