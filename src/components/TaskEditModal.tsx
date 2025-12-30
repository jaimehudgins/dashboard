"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { useApp } from "@/store/store";
import { Task, Priority, TaskStatus } from "@/types";

interface TaskEditModalProps {
  task: Task;
  onClose: () => void;
}

export default function TaskEditModal({ task, onClose }: TaskEditModalProps) {
  const { state, dispatch } = useApp();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [projectId, setProjectId] = useState(task.projectId);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "",
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    dispatch({
      type: "UPDATE_TASK",
      payload: {
        ...task,
        title: title.trim(),
        description: description.trim() || undefined,
        projectId,
        priority,
        status,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
    });

    onClose();
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this task?")) {
      dispatch({ type: "DELETE_TASK", payload: task.id });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">Edit Task</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Add details, notes, or context..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleDelete}
              className="text-red-500 hover:text-red-600 text-sm font-medium transition-colors"
            >
              Delete Task
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
