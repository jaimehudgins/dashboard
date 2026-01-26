"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Calendar,
  Users,
  Pencil,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface SyncedTask {
  id: string;
  source_id: string;
  source_table: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  due_date: string | null;
  synced_at: string;
}

export default function PartnerTasks() {
  const [tasks, setTasks] = useState<SyncedTask[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<SyncedTask | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function fetchTasks() {
      try {
        const { data, error } = await supabase
          .from("synced_tasks")
          .select("*")
          .order("due_date", { ascending: true, nullsFirst: false });

        if (error) {
          console.error("Error fetching synced tasks:", error);
          return;
        }

        setTasks(data || []);
      } catch (err) {
        console.error("Error fetching synced tasks:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTasks();

    // Set up real-time subscription
    const subscription = supabase
      .channel("synced_tasks_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "synced_tasks" },
        () => {
          fetchTasks();
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return null;

    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil(
      (taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays < 0) return { text: "Overdue", className: "text-red-500" };
    if (diffDays === 0) return { text: "Today", className: "text-amber-500" };
    if (diffDays === 1) return { text: "Tomorrow", className: "text-blue-500" };
    if (diffDays <= 7)
      return { text: `${diffDays}d`, className: "text-slate-500" };
    return {
      text: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      className: "text-slate-400",
    };
  };

  const isCompleted = (status: string | null) => {
    if (!status) return false;
    const lowerStatus = status.toLowerCase();
    return (
      lowerStatus === "completed" ||
      lowerStatus === "complete" ||
      lowerStatus === "done"
    );
  };

  const handleToggleComplete = async (task: SyncedTask) => {
    const newStatus = isCompleted(task.status) ? "pending" : "completed";

    // Optimistic update - update UI immediately
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
    );

    const { error } = await supabase
      .from("synced_tasks")
      .update({ status: newStatus })
      .eq("id", task.id);

    if (error) {
      console.error("Error updating task:", error);
      // Revert on error
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
      );
    }
  };

  const openEditModal = (task: SyncedTask) => {
    setEditingTask(task);
    setEditTitle(task.title || "");
    setEditDescription(task.description || "");
    setEditStatus(task.status || "pending");
    setEditDueDate(task.due_date ? task.due_date.split("T")[0] : "");
  };

  const handleSaveEdit = async () => {
    if (!editingTask) return;

    setIsSaving(true);

    const updatedTask = {
      ...editingTask,
      title: editTitle,
      description: editDescription,
      status: editStatus,
      due_date: editDueDate || null,
    };

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === editingTask.id ? updatedTask : t)),
    );

    const { error } = await supabase
      .from("synced_tasks")
      .update({
        title: editTitle,
        description: editDescription,
        status: editStatus,
        due_date: editDueDate || null,
      })
      .eq("id", editingTask.id);

    setIsSaving(false);

    if (error) {
      console.error("Error updating task:", error);
      // Revert on error
      setTasks((prev) =>
        prev.map((t) => (t.id === editingTask.id ? editingTask : t)),
      );
      return;
    }

    setEditingTask(null);
  };

  // Filter to active tasks only and limit to 5 with closest due dates
  const activeTasks = tasks
    .filter((t) => !isCompleted(t.status))
    .sort((a, b) => {
      // Sort by due date ascending (closest first), nulls last
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    })
    .slice(0, 5);

  const renderTask = (task: SyncedTask) => {
    const completed = isCompleted(task.status);
    const dueInfo = formatDueDate(task.due_date);

    return (
      <div
        key={task.id}
        className="group flex items-start gap-2 py-1.5 px-2 rounded hover:bg-slate-100 transition-colors cursor-pointer"
        onClick={() => openEditModal(task)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleComplete(task);
          }}
          className="flex-shrink-0 mt-0.5"
        >
          {completed ? (
            <CheckCircle2 size={14} className="text-green-500" />
          ) : (
            <Circle size={14} className="text-slate-300 hover:text-slate-500" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <span
            className={`text-sm ${
              completed ? "text-slate-400 line-through" : "text-slate-700"
            }`}
          >
            {task.title || "Untitled Task"}
          </span>
          {/* Show additional details */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {dueInfo && (
              <span
                className={`text-xs flex items-center gap-0.5 ${dueInfo.className}`}
              >
                <Calendar size={10} />
                {dueInfo.text}
              </span>
            )}
            {task.status && !completed && (
              <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                {task.status}
              </span>
            )}
          </div>
          {task.description && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {task.description}
            </p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            openEditModal(task);
          }}
          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-500 transition-all flex-shrink-0"
        >
          <Pencil size={12} />
        </button>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="pt-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Partner Tasks
          </h3>
        </div>
        <p className="text-xs text-slate-400 px-3 py-2 italic">Loading...</p>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between px-3 mb-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Partner Tasks
        </h3>
        <span className="text-xs text-slate-400">{activeTasks.length}</span>
      </div>

      <div className="px-1">
        {/* Active Tasks */}
        <div className="mb-2">
          <div
            className="group flex items-center gap-1 py-1.5 px-2 rounded hover:bg-slate-100 transition-colors cursor-pointer"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <button className="text-slate-400">
              {isCollapsed ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>
            <Users size={14} className="text-indigo-500" />
            <span className="flex-1 text-sm font-medium text-slate-700">
              From CRM
            </span>
            <span className="text-xs text-slate-400">{activeTasks.length}</span>
          </div>

          {!isCollapsed && (
            <div className="ml-5 border-l border-slate-200 pl-2">
              {activeTasks.length > 0 ? (
                activeTasks.map(renderTask)
              ) : (
                <p className="text-xs text-slate-400 py-1.5 px-2 italic">
                  No active tasks
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingTask &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-slate-900">
                  Edit Partner Task
                </h3>
                <button
                  onClick={() => setEditingTask(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Description
                  </label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setEditingTask(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
