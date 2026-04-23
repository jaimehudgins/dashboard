"use client";

import React, { useState, useMemo } from "react";
import { Zap, Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { format, startOfDay } from "date-fns";
import { useApp } from "@/store/store";
import { QuickTask, QuickTaskStatus } from "@/types";

const STATUS_OPTIONS: { value: QuickTaskStatus; label: string; cls: string }[] = [
  { value: "not_started", label: "Not Started", cls: "bg-slate-100 text-slate-700" },
  { value: "in_progress", label: "In Progress", cls: "bg-blue-100 text-blue-700" },
  { value: "complete", label: "Complete", cls: "bg-green-100 text-green-700" },
];

export default function QuickTasks() {
  const { state, dispatch } = useApp();

  const [newTask, setNewTask] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTask, setEditTask] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const sorted = useMemo(() => {
    const arr = [...state.quickTasks];
    arr.sort((a, b) => {
      // incomplete first
      const aDone = a.status === "complete" ? 1 : 0;
      const bDone = b.status === "complete" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      // due date ascending, nulls last
      const ad = a.dueDate ? a.dueDate.getTime() : Infinity;
      const bd = b.dueDate ? b.dueDate.getTime() : Infinity;
      return ad - bd;
    });
    return arr;
  }, [state.quickTasks]);

  const handleAdd = () => {
    const title = newTask.trim();
    if (!title) return;
    const now = new Date();
    const quickTask: QuickTask = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `quick-${Date.now()}`,
      task: title,
      dueDate: newDueDate ? new Date(newDueDate + "T00:00:00") : undefined,
      notes: undefined,
      status: "not_started",
      displayOrder: state.quickTasks.length,
      createdAt: now,
      updatedAt: now,
    };
    dispatch({ type: "ADD_QUICK_TASK", payload: quickTask });
    setNewTask("");
    setNewDueDate("");
  };

  const handleStatusChange = (t: QuickTask, status: QuickTaskStatus) => {
    dispatch({
      type: "UPDATE_QUICK_TASK",
      payload: { ...t, status, updatedAt: new Date() },
    });
  };

  const handleDelete = (id: string) => {
    dispatch({ type: "DELETE_QUICK_TASK", payload: id });
  };

  const startEdit = (t: QuickTask) => {
    setEditingId(t.id);
    setEditTask(t.task);
    setEditDueDate(
      t.dueDate ? format(t.dueDate, "yyyy-MM-dd") : "",
    );
    setEditNotes(t.notes || "");
  };

  const saveEdit = (t: QuickTask) => {
    if (!editTask.trim()) return;
    dispatch({
      type: "UPDATE_QUICK_TASK",
      payload: {
        ...t,
        task: editTask.trim(),
        dueDate: editDueDate ? new Date(editDueDate + "T00:00:00") : undefined,
        notes: editNotes.trim() || undefined,
        updatedAt: new Date(),
      },
    });
    setEditingId(null);
  };

  const isOverdue = (t: QuickTask) => {
    if (!t.dueDate || t.status === "complete") return false;
    return startOfDay(t.dueDate) < startOfDay(new Date());
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
          <Zap className="text-amber-500" size={18} />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">Quick Tasks</h2>
          <p className="text-xs text-slate-500">
            {state.quickTasks.filter((t) => t.status !== "complete").length} open
          </p>
        </div>
      </div>

      {/* Add form */}
      <div className="px-3 py-3 border-b border-slate-200 bg-slate-50 space-y-2">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="Add a quick task…"
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleAdd}
            disabled={!newTask.trim()}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-auto max-h-[640px] divide-y divide-slate-100">
        {sorted.length === 0 ? (
          <div className="text-center text-slate-400 py-10 text-sm">
            No quick tasks yet.
          </div>
        ) : (
          sorted.map((t) => {
            const overdue = isOverdue(t);
            const isEditing = editingId === t.id;
            return (
              <div key={t.id} className="px-3 py-2">
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      value={editTask}
                      onChange={(e) => setEditTask(e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Notes…"
                      rows={2}
                      className="w-full px-2 py-1 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 text-slate-500 hover:text-slate-700"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => saveEdit(t)}
                        className="p-1 text-green-600 hover:text-green-700"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm ${
                          t.status === "complete"
                            ? "line-through text-slate-400"
                            : "text-slate-900"
                        }`}
                      >
                        {t.task}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {t.dueDate && (
                          <span
                            className={`text-xs ${
                              overdue
                                ? "text-red-600 font-medium"
                                : "text-slate-500"
                            }`}
                          >
                            {format(t.dueDate, "MMM d")}
                          </span>
                        )}
                        <select
                          value={t.status}
                          onChange={(e) =>
                            handleStatusChange(
                              t,
                              e.target.value as QuickTaskStatus,
                            )
                          }
                          className={`text-xs rounded px-1.5 py-0.5 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer ${
                            STATUS_OPTIONS.find((s) => s.value === t.status)
                              ?.cls || ""
                          }`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {t.notes && (
                        <div className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">
                          {t.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(t)}
                        className="p-1 text-slate-400 hover:text-slate-700"
                        title="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="p-1 text-slate-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
