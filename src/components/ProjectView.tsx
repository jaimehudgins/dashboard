"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import {
  FileText,
  Edit3,
  Eye,
  Plus,
  Play,
  CheckCircle2,
  Clock,
  Flame,
  AlertCircle,
  Trash2,
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

interface ProjectViewProps {
  projectId: string;
  onStartFocus: (task: Task) => void;
}

export default function ProjectView({
  projectId,
  onStartFocus,
}: ProjectViewProps) {
  const { state, dispatch } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("medium");
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const project = state.projects.find((p) => p.id === projectId);
  const tasks = state.tasks.filter((t) => t.projectId === projectId);
  const activeTasks = tasks.filter((t) => t.status !== "completed");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  if (!project) {
    return <div className="text-white">Project not found</div>;
  }

  const handleScratchpadChange = (content: string) => {
    dispatch({
      type: "UPDATE_SCRATCHPAD",
      payload: { projectId, content },
    });
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    dispatch({
      type: "ADD_TASK",
      payload: {
        id: `task-${Date.now()}`,
        title: newTaskTitle,
        priority: newTaskPriority,
        status: "pending",
        projectId,
        createdAt: new Date(),
        focusMinutes: 0,
      },
    });

    setNewTaskTitle("");
    setShowAddTask(false);
  };

  const handleCompleteTask = (task: Task) => {
    dispatch({
      type: "UPDATE_TASK",
      payload: { ...task, status: "completed" },
    });
  };

  const handleDeleteTask = (taskId: string) => {
    dispatch({ type: "DELETE_TASK", payload: taskId });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <div>
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
            {project.description && (
              <p className="text-slate-400 mt-1">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <Flame size={14} className="text-orange-400" />
            {project.totalFocusMinutes}m focused
          </div>
          <div>{activeTasks.length} active tasks</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Tasks Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Tasks</h2>
            <button
              onClick={() => setShowAddTask(true)}
              className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors"
            >
              <Plus size={16} />
              Add Task
            </button>
          </div>

          {showAddTask && (
            <form
              onSubmit={handleAddTask}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3"
            >
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Task title..."
                autoFocus
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex items-center gap-3">
                <select
                  value={newTaskPriority}
                  onChange={(e) =>
                    setNewTaskPriority(e.target.value as Priority)
                  }
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <button
                  type="submit"
                  className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTask(false)}
                  className="text-slate-400 hover:text-white px-4 py-2 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {activeTasks.length === 0 && !showAddTask ? (
            <div className="bg-slate-800/30 border border-slate-700 border-dashed rounded-xl p-8 text-center">
              <CheckCircle2 className="mx-auto text-green-400 mb-3" size={32} />
              <p className="text-sm text-slate-400">No active tasks</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeTasks.map((task) => {
                const priority = priorityConfig[task.priority];
                const isOverdue =
                  task.dueDate && new Date(task.dueDate) < new Date();

                return (
                  <div
                    key={task.id}
                    className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 group hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => handleCompleteTask(task)}
                        className="mt-0.5 w-5 h-5 rounded-full border-2 border-slate-600 hover:border-green-500 hover:bg-green-500/20 transition-colors"
                      />
                      <div className="flex-1">
                        <p className="text-white font-medium">{task.title}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span
                            className={`px-2 py-0.5 rounded-full ${priority.bg} ${priority.color}`}
                          >
                            {priority.label}
                          </span>
                          {task.dueDate && (
                            <span
                              className={`flex items-center gap-1 ${isOverdue ? "text-red-400" : "text-slate-500"}`}
                            >
                              {isOverdue ? (
                                <AlertCircle size={12} />
                              ) : (
                                <Clock size={12} />
                              )}
                              {format(new Date(task.dueDate), "MMM d")}
                            </span>
                          )}
                          {task.focusMinutes > 0 && (
                            <span className="flex items-center gap-1 text-slate-500">
                              <Flame size={12} className="text-orange-400" />
                              {task.focusMinutes}m
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingTask(task)}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                          aria-label="Edit task"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => onStartFocus(task)}
                          className="p-2 text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                          aria-label="Start focus session"
                        >
                          <Play size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          aria-label="Delete task"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {completedTasks.length > 0 && (
            <div className="pt-4">
              <h3 className="text-sm font-medium text-slate-500 mb-2">
                Completed ({completedTasks.length})
              </h3>
              <div className="space-y-2">
                {completedTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-3 flex items-center gap-3"
                  >
                    <CheckCircle2 size={16} className="text-green-500" />
                    <span className="text-slate-500 line-through">
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scratchpad Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileText size={18} />
              Scratchpad
            </h2>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                isEditing
                  ? "text-indigo-400"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {isEditing ? <Eye size={16} /> : <Edit3 size={16} />}
              {isEditing ? "Preview" : "Edit"}
            </button>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden h-[500px]">
            {isEditing ? (
              <textarea
                value={project.scratchpad}
                onChange={(e) => handleScratchpadChange(e.target.value)}
                className="w-full h-full bg-transparent p-4 text-white placeholder-slate-500 resize-none focus:outline-none font-mono text-sm leading-relaxed"
                placeholder="Write your notes in Markdown..."
              />
            ) : (
              <div className="p-4 prose prose-invert prose-sm max-w-none overflow-auto h-full">
                <ReactMarkdown>{project.scratchpad}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
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
