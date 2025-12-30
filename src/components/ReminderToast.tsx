"use client";

import React from "react";
import { X, Bell, Clock } from "lucide-react";
import { Task } from "@/types";

interface ReminderToastProps {
  task: Task;
  onDismiss: () => void;
}

export default function ReminderToast({ task, onDismiss }: ReminderToastProps) {
  return (
    <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-lg max-w-sm animate-slide-in">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Bell className="text-amber-600" size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900">Upcoming Task</p>
          <p className="text-sm text-slate-700 mt-1 truncate">{task.title}</p>
          {task.dueDate && (
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <Clock size={12} />
              Due: {new Date(task.dueDate).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Dismiss reminder"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
