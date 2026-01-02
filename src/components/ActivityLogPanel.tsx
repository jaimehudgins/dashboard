"use client";

import React from "react";
import { Activity, CheckCircle2, Plus, Edit2, Trash2, Clock, Flag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useApp } from "@/store/store";

interface ActivityLogPanelProps {
  projectId?: string;
  limit?: number;
}

const actionIcons: Record<string, React.ReactNode> = {
  task_created: <Plus size={12} className="text-green-500" />,
  task_completed: <CheckCircle2 size={12} className="text-green-500" />,
  task_updated: <Edit2 size={12} className="text-blue-500" />,
  task_deleted: <Trash2 size={12} className="text-red-500" />,
  focus_started: <Clock size={12} className="text-orange-500" />,
  focus_completed: <Clock size={12} className="text-green-500" />,
  milestone_created: <Flag size={12} className="text-indigo-500" />,
  milestone_completed: <Flag size={12} className="text-green-500" />,
  comment_added: <Activity size={12} className="text-slate-500" />,
};

const actionLabels: Record<string, string> = {
  task_created: "created task",
  task_completed: "completed task",
  task_updated: "updated task",
  task_deleted: "deleted task",
  focus_started: "started focus on",
  focus_completed: "completed focus on",
  milestone_created: "created milestone",
  milestone_completed: "completed milestone",
  comment_added: "commented on",
};

export default function ActivityLogPanel({ projectId, limit = 10 }: ActivityLogPanelProps) {
  const { state } = useApp();

  // Filter activity logs by project if specified
  let logs = [...state.activityLogs];
  if (projectId) {
    logs = logs.filter((log) => log.projectId === projectId);
  }

  // Sort by most recent first and limit
  logs = logs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  if (logs.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-slate-500" />
          <h3 className="text-sm font-medium text-slate-700">Activity</h3>
        </div>
        <p className="text-xs text-slate-400 text-center py-4">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-slate-500" />
        <h3 className="text-sm font-medium text-slate-700">Recent Activity</h3>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {logs.map((log) => {
          const icon = actionIcons[log.action] || <Activity size={12} className="text-slate-400" />;
          const label = actionLabels[log.action] || log.action;
          const details = log.details as { taskTitle?: string; milestoneName?: string } | undefined;
          const itemName = details?.taskTitle || details?.milestoneName || "";

          return (
            <div
              key={log.id}
              className="flex items-start gap-2 text-xs text-slate-600 py-1.5 border-b border-slate-100 last:border-b-0"
            >
              <div className="mt-0.5">{icon}</div>
              <div className="flex-1 min-w-0">
                <span>{label}</span>
                {itemName && (
                  <span className="font-medium text-slate-900 ml-1 truncate">
                    "{itemName}"
                  </span>
                )}
                <div className="text-slate-400 mt-0.5">
                  {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
