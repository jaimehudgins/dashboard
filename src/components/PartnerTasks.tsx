"use client";

import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Calendar,
  Users,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface SyncedTask {
  id: string;
  source_id: string;
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
        }
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
      (taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return { text: "Overdue", className: "text-red-500" };
    if (diffDays === 0) return { text: "Today", className: "text-amber-500" };
    if (diffDays === 1) return { text: "Tomorrow", className: "text-blue-500" };
    if (diffDays <= 7) return { text: `${diffDays}d`, className: "text-slate-500" };
    return {
      text: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      className: "text-slate-400",
    };
  };

  const isCompleted = (status: string | null) => {
    if (!status) return false;
    const lowerStatus = status.toLowerCase();
    return lowerStatus === "completed" || lowerStatus === "done";
  };

  const activeTasks = tasks.filter((t) => !isCompleted(t.status));
  const completedTasks = tasks.filter((t) => isCompleted(t.status));

  const renderTask = (task: SyncedTask) => {
    const completed = isCompleted(task.status);
    const dueInfo = formatDueDate(task.due_date);

    return (
      <div
        key={task.id}
        className="group flex items-start gap-2 py-1.5 px-2 rounded hover:bg-slate-100 transition-colors"
      >
        <div className="flex-shrink-0 mt-0.5">
          {completed ? (
            <CheckCircle2 size={14} className="text-green-500" />
          ) : (
            <Circle size={14} className="text-slate-300" />
          )}
        </div>
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
    </div>
  );
}
