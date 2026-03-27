"use client";

import React, { useState } from "react";
import { Plus, Zap, ClipboardList } from "lucide-react";
import { useApp } from "@/store/store";
import { Priority } from "@/types";
import TaskCreateModal from "./TaskCreateModal";

type CaptureTarget =
  | { type: "unassigned" }
  | { type: "project"; projectId: string }
  | { type: "misc"; categoryId: string };

export default function QuickCapture() {
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<CaptureTarget>({ type: "unassigned" });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { state, dispatch } = useApp();

  const activeProjects = state.projects.filter((p) => !p.archived);
  const categories = state.miscCategories;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (target.type === "unassigned") {
      dispatch({
        type: "ADD_TASK",
        payload: {
          id: `task-${Date.now()}`,
          title: input.trim(),
          priority: "medium" as Priority,
          status: "pending",
          projectId: null,
          createdAt: new Date(),
          focusMinutes: 0,
        },
      });
    } else if (target.type === "project") {
      dispatch({
        type: "ADD_TASK",
        payload: {
          id: `task-${Date.now()}`,
          title: input.trim(),
          priority: "medium" as Priority,
          status: "pending",
          projectId: target.projectId,
          createdAt: new Date(),
          focusMinutes: 0,
        },
      });
    } else if (target.type === "misc") {
      dispatch({
        type: "ADD_TASK",
        payload: {
          id: `task-${Date.now()}`,
          title: input.trim(),
          priority: "medium" as Priority,
          status: "pending",
          projectId: null,
          categoryId: target.categoryId,
          createdAt: new Date(),
          focusMinutes: 0,
        },
      });
    }

    setInput("");
  };

  const getTargetColor = () => {
    if (target.type === "project") {
      const project = activeProjects.find((p) => p.id === target.projectId);
      return project?.color;
    }
    if (target.type === "misc") {
      const category = categories.find((c) => c.id === target.categoryId);
      return category?.color;
    }
    return undefined;
  };

  return (
    <>
      <div className="bg-white">
        <div className="flex items-center gap-3 px-8 py-4">
          {/* New Task button */}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          >
            <ClipboardList size={16} />
            New Task
          </button>

          <div className="h-8 w-px bg-slate-200 flex-shrink-0" />

          {/* Quick Capture */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-3 flex-1"
          >
            <div className="flex items-center gap-2 text-slate-400 flex-shrink-0">
              <Zap size={14} />
              <span className="text-xs font-medium uppercase tracking-wider">
                Quick
              </span>
            </div>
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Brain dump... Press Enter to capture"
                aria-label="Quick capture input"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Target Selector */}
            <div className="relative flex-shrink-0">
              <select
                value={
                  target.type === "unassigned"
                    ? "unassigned"
                    : target.type === "project"
                      ? `project:${target.projectId}`
                      : `misc:${target.categoryId}`
                }
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "unassigned") {
                    setTarget({ type: "unassigned" });
                  } else if (value.startsWith("project:")) {
                    setTarget({
                      type: "project",
                      projectId: value.replace("project:", ""),
                    });
                  } else if (value.startsWith("misc:")) {
                    setTarget({
                      type: "misc",
                      categoryId: value.replace("misc:", ""),
                    });
                  }
                }}
                className="appearance-none bg-slate-100 border border-slate-200 rounded-lg pl-3 pr-8 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="unassigned">Unassigned</option>

                {activeProjects.length > 0 && (
                  <optgroup label="Projects">
                    {activeProjects.map((project) => (
                      <option key={project.id} value={`project:${project.id}`}>
                        {project.name}
                      </option>
                    ))}
                  </optgroup>
                )}

                {categories.length > 0 && (
                  <optgroup label="Misc Tasks">
                    {categories.map((category) => (
                      <option key={category.id} value={`misc:${category.id}`}>
                        {category.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {getTargetColor() && (
                <div
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                  style={{ backgroundColor: getTargetColor() }}
                />
              )}
            </div>

            <button
              type="submit"
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
            >
              <Plus size={16} />
              Capture
            </button>
          </form>
        </div>
      </div>

      {showCreateModal && (
        <TaskCreateModal onClose={() => setShowCreateModal(false)} />
      )}
    </>
  );
}
