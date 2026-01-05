"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import {
  Inbox as InboxIcon,
  ArrowRight,
  Trash2,
  Calendar,
  Flag,
  FolderKanban,
} from "lucide-react";
import { useApp } from "@/store/store";
import { InboxItem, Priority } from "@/types";

interface ProcessModalProps {
  item: InboxItem;
  onClose: () => void;
}

type TaskTarget =
  | { type: "project"; projectId: string }
  | { type: "misc"; categoryId: string };

function ProcessModal({ item, onClose }: ProcessModalProps) {
  const { state, dispatch } = useApp();
  const [title, setTitle] = useState(item.content);
  const [target, setTarget] = useState<TaskTarget>(
    state.projects[0]?.id
      ? { type: "project", projectId: state.projects[0].id }
      : state.miscCategories[0]?.id
        ? { type: "misc", categoryId: state.miscCategories[0].id }
        : { type: "project", projectId: "" },
  );
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");

  const activeProjects = state.projects.filter((p) => !p.archived);
  const categories = state.miscCategories;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (target.type === "project") {
      dispatch({
        type: "ADD_TASK",
        payload: {
          id: `task-${Date.now()}`,
          title,
          priority,
          status: "pending",
          projectId: target.projectId,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          createdAt: new Date(),
          focusMinutes: 0,
        },
      });
    } else {
      dispatch({
        type: "ADD_TASK",
        payload: {
          id: `task-${Date.now()}`,
          title,
          priority,
          status: "pending",
          projectId: "misc",
          categoryId: target.categoryId,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          createdAt: new Date(),
          focusMinutes: 0,
        },
      });
    }

    dispatch({
      type: "REMOVE_INBOX_ITEM",
      payload: item.id,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Process Inbox Item
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Task Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Destination
            </label>
            <select
              value={
                target.type === "project"
                  ? `project:${target.projectId}`
                  : `misc:${target.categoryId}`
              }
              onChange={(e) => {
                const value = e.target.value;
                if (value.startsWith("project:")) {
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
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {activeProjects.length > 0 && (
                <optgroup label="Projects">
                  {activeProjects.map((p) => (
                    <option key={p.id} value={`project:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {categories.length > 0 && (
                <optgroup label="Misc Tasks">
                  {categories.map((c) => (
                    <option key={c.id} value={`misc:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
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

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg font-medium transition-colors"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function InboxView() {
  const { state, dispatch } = useApp();
  const [processingItem, setProcessingItem] = useState<InboxItem | null>(null);

  const handleDelete = (id: string) => {
    dispatch({ type: "REMOVE_INBOX_ITEM", payload: id });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
        <p className="text-slate-500 mt-1">
          Process your brain dumps into actionable tasks
        </p>
      </div>

      {state.inbox.length === 0 ? (
        <div className="bg-white border border-slate-200 border-dashed rounded-xl p-12 text-center">
          <InboxIcon className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-slate-900 font-medium mb-2">Inbox Zero!</h3>
          <p className="text-sm text-slate-500">
            Use Quick Capture above to add new items
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {state.inbox.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 group hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <div className="flex-1">
                <p className="text-slate-900">{item.content}</p>
                <p className="text-xs text-slate-400 mt-1">
                  Captured {format(new Date(item.createdAt), "MMM d, h:mm a")}
                </p>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setProcessingItem(item)}
                  className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <ArrowRight size={14} />
                  Process
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label="Delete inbox item"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {processingItem && (
        <ProcessModal
          item={processingItem}
          onClose={() => setProcessingItem(null)}
        />
      )}
    </div>
  );
}
