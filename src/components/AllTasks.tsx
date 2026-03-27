"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  AlertCircle,
  Clock,
  Play,
  CheckCircle2,
  Pencil,
  Circle,
  Calendar,
  ListTodo,
  Inbox,
  Users,
  ExternalLink,
  X,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task, Priority } from "@/types";
import { format, startOfDay } from "date-fns";
import TaskEditModal from "./TaskEditModal";
import {
  crmSupabase,
  isCrmConfigured,
  CrmFollowUpTask,
  CrmPartner,
  TaskStatus as CrmTaskStatus,
} from "@/lib/crm-supabase";

interface AllTasksProps {
  onFocusTask?: (task: Task) => void;
}

interface PartnerTaskItem {
  id: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
  status: CrmTaskStatus;
  partnerId: string;
  partnerName: string;
  notes?: string;
  type: "task" | "followup" | "onboarding";
}

export default function AllTasks({ onFocusTask }: AllTasksProps) {
  const { state, dispatch } = useApp();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [partnerTasks, setPartnerTasks] = useState<PartnerTaskItem[]>([]);
  const [loadingPartnerTasks, setLoadingPartnerTasks] = useState(true);
  const [editingPartnerTask, setEditingPartnerTask] = useState<PartnerTaskItem | null>(null);
  const [editPartnerTaskTitle, setEditPartnerTaskTitle] = useState("");
  const [editPartnerTaskNotes, setEditPartnerTaskNotes] = useState("");
  const [editPartnerTaskDueDate, setEditPartnerTaskDueDate] = useState("");
  const [savingPartnerTask, setSavingPartnerTask] = useState(false);

  // Get active tasks (not completed, not subtasks)
  const activeTasks = useMemo(() => {
    return state.tasks.filter(
      (t) => t.status !== "completed" && !t.parentTaskId
    );
  }, [state.tasks]);

  // Group tasks by work area
  const tasksByWorkArea = useMemo(() => {
    const groups = new Map<string, Task[]>();

    // Initialize groups for all work areas
    state.workAreas.forEach((wa) => {
      groups.set(wa.id, []);
    });

    // Add "unassigned" group
    groups.set("unassigned", []);

    // Distribute tasks
    activeTasks.forEach((task) => {
      if (task.workAreaId && groups.has(task.workAreaId)) {
        groups.get(task.workAreaId)!.push(task);
      } else {
        groups.get("unassigned")!.push(task);
      }
    });

    // Sort tasks within each group by due date
    groups.forEach((tasks) => {
      tasks.sort((a, b) => {
        // Tasks with due dates come first
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;

        // Both have due dates - sort by date
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }

        // Neither has due date - sort by priority
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    });

    return groups;
  }, [activeTasks, state.workAreas]);

  // Fetch partner tasks from CRM
  const fetchPartnerTasks = async () => {
    try {
      setLoadingPartnerTasks(true);

      if (!isCrmConfigured) {
        setLoadingPartnerTasks(false);
        return;
      }

      const { data: partnersData, error: partnersError } = await crmSupabase
        .from("partners")
        .select("id, name, status")
        .order("name");

      if (partnersError) throw partnersError;

      const { data: followUpData, error: followUpError } = await crmSupabase
        .from("follow_up_tasks")
        .select("*")
        .eq("completed", false)
        .order("due_date", { ascending: true, nullsFirst: false });

      if (followUpError) throw followUpError;

      const { data: onboardingData, error: onboardingError } = await crmSupabase
        .from("onboarding_tasks")
        .select("*")
        .not("due_date", "is", null)
        .not("status", "in", '("complete","completed","na")');

      if (onboardingError) throw onboardingError;

      const taskItems: PartnerTaskItem[] = [];

      (followUpData || []).forEach((task: CrmFollowUpTask) => {
        const partner = partnersData?.find((p) => p.id === task.partner_id);
        taskItems.push({
          id: task.id,
          type: task.touchpoint_id ? "followup" : "task",
          title: task.task,
          dueDate: task.due_date,
          completed: task.completed,
          status: (task.status as CrmTaskStatus) || "Not Started",
          partnerId: task.partner_id || "",
          partnerName: partner?.name || "Unknown Partner",
          notes: task.notes,
        });
      });

      (onboardingData || []).forEach((task: any) => {
        const partner = partnersData?.find((p) => p.id === task.partner_id);
        taskItems.push({
          id: task.id,
          type: "onboarding",
          title: task.title,
          dueDate: task.due_date,
          completed: false,
          status: task.status || "Not Started",
          partnerId: task.partner_id,
          partnerName: partner?.name || "Unknown Partner",
        });
      });

      // Sort by due date
      taskItems.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });

      setPartnerTasks(taskItems);
    } catch (err) {
      console.error("Error fetching partner tasks:", err);
    } finally {
      setLoadingPartnerTasks(false);
    }
  };

  // Fetch partner tasks on mount and set up real-time subscription
  useEffect(() => {
    fetchPartnerTasks();

    const subscription = crmSupabase
      .channel("partner_tasks_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follow_up_tasks" },
        () => {
          fetchPartnerTasks();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "onboarding_tasks" },
        () => {
          fetchPartnerTasks();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Handle partner task status change (two-way sync)
  const handlePartnerTaskStatusChange = async (
    taskId: string,
    newStatus: CrmTaskStatus,
    taskType: PartnerTaskItem["type"]
  ) => {
    try {
      if (taskType === "onboarding") {
        const { error } = await crmSupabase
          .from("onboarding_tasks")
          .update({ status: newStatus })
          .eq("id", taskId);
        if (error) throw error;
      } else {
        const { error } = await crmSupabase
          .from("follow_up_tasks")
          .update({
            status: newStatus,
            completed: newStatus === "Complete",
          })
          .eq("id", taskId);
        if (error) throw error;
      }
      // Refresh data
      fetchPartnerTasks();
    } catch (err) {
      console.error("Error updating partner task:", err);
    }
  };

  // Handle saving edited partner task
  const handleSavePartnerTask = async () => {
    if (!editingPartnerTask || !editPartnerTaskTitle.trim()) return;

    setSavingPartnerTask(true);
    try {
      if (editingPartnerTask.type === "onboarding") {
        const { error } = await crmSupabase
          .from("onboarding_tasks")
          .update({
            title: editPartnerTaskTitle.trim(),
            due_date: editPartnerTaskDueDate || null,
          })
          .eq("id", editingPartnerTask.id);
        if (error) throw error;
      } else {
        const { error } = await crmSupabase
          .from("follow_up_tasks")
          .update({
            task: editPartnerTaskTitle.trim(),
            notes: editPartnerTaskNotes || null,
            due_date: editPartnerTaskDueDate || null,
          })
          .eq("id", editingPartnerTask.id);
        if (error) throw error;
      }

      setEditingPartnerTask(null);
      fetchPartnerTasks();
    } catch (err) {
      console.error("Error saving partner task:", err);
    } finally {
      setSavingPartnerTask(false);
    }
  };

  const handleComplete = (task: Task) => {
    dispatch({
      type: "UPDATE_TASK",
      payload: { ...task, status: "completed" },
    });
  };

  const handleFocus = (task: Task) => {
    if (onFocusTask) {
      onFocusTask(task);
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case "critical":
        return "text-red-600 bg-red-50";
      case "high":
        return "text-orange-600 bg-orange-50";
      case "medium":
        return "text-yellow-600 bg-yellow-50";
      case "low":
        return "text-slate-600 bg-slate-50";
    }
  };

  const isOverdue = (task: Task) => {
    if (!task.dueDate) return false;
    const today = startOfDay(new Date());
    const dueDate = startOfDay(new Date(task.dueDate));
    return dueDate < today;
  };

  const handleWorkAreaChange = (task: Task, newWorkAreaId: string | undefined) => {
    dispatch({
      type: "UPDATE_TASK",
      payload: {
        ...task,
        workAreaId: newWorkAreaId,
      },
    });
  };

  const renderTaskCard = (task: Task) => {
    const project = state.projects.find((p) => p.id === task.projectId);
    const taskIsOverdue = isOverdue(task);
    const currentWorkArea = task.workAreaId
      ? state.workAreas.find((w) => w.id === task.workAreaId)
      : null;

    return (
      <div
        key={task.id}
        className="bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-start gap-2">
          {/* Complete Button */}
          <button
            onClick={() => handleComplete(task)}
            className="flex-shrink-0 mt-0.5 text-slate-400 hover:text-green-500 transition-colors"
          >
            <Circle size={16} />
          </button>

          {/* Task Content */}
          <div className="flex-1 min-w-0">
            {/* Title and Priority */}
            <div className="flex items-start gap-2 mb-1">
              <h4 className="text-sm font-medium text-slate-900 flex-1 line-clamp-2">
                {task.title}
              </h4>
              <span
                className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${getPriorityColor(
                  task.priority
                )}`}
              >
                {task.priority.charAt(0).toUpperCase()}
              </span>
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
              {project && (
                <span className="flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  {project.name}
                </span>
              )}

              {task.dueDate && (
                <span
                  className={`flex items-center gap-1 ${
                    taskIsOverdue ? "text-red-500 font-medium" : ""
                  }`}
                >
                  {taskIsOverdue ? (
                    <AlertCircle size={10} />
                  ) : (
                    <Calendar size={10} />
                  )}
                  {format(new Date(task.dueDate), "MMM d")}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleFocus(task)}
                className="flex items-center gap-1 px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-xs font-medium transition-colors"
              >
                <Play size={10} />
                Focus
              </button>
              <button
                onClick={() => setEditingTask(task)}
                className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
              >
                <Pencil size={10} />
                Edit
              </button>
              <select
                value={task.workAreaId || ""}
                onChange={(e) =>
                  handleWorkAreaChange(task, e.target.value || undefined)
                }
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors cursor-pointer border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                style={
                  currentWorkArea
                    ? {
                        backgroundColor: `${currentWorkArea.color}15`,
                        color: currentWorkArea.color,
                      }
                    : {}
                }
              >
                <option value="">Unassigned</option>
                {state.workAreas.map((wa) => (
                  <option key={wa.id} value={wa.id}>
                    {wa.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPartnerTaskCard = (task: PartnerTaskItem) => {
    const formatDate = (dateStr: string | null) => {
      if (!dateStr) return "";
      return format(new Date(dateStr), "MMM d");
    };

    const isOverdue = (dateStr: string | null) => {
      if (!dateStr) return false;
      const today = startOfDay(new Date());
      const dueDate = startOfDay(new Date(dateStr));
      return dueDate < today;
    };

    const taskIsOverdue = isOverdue(task.dueDate);

    return (
      <div
        key={task.id}
        className="bg-white border border-slate-200 rounded-lg p-3 hover:border-slate-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-start gap-2">
          {/* Complete Button */}
          <button
            onClick={() =>
              handlePartnerTaskStatusChange(task.id, "Complete", task.type)
            }
            className="flex-shrink-0 mt-0.5 text-slate-400 hover:text-green-500 transition-colors"
          >
            {task.status === "Complete" ? (
              <CheckCircle2 size={16} className="text-green-500" />
            ) : (
              <Circle size={16} />
            )}
          </button>

          {/* Task Content */}
          <div className="flex-1 min-w-0">
            {/* Title and Status Badge */}
            <div className="flex items-start gap-2 mb-1">
              <h4 className="text-sm font-medium text-slate-900 flex-1 line-clamp-2">
                {task.title}
              </h4>
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-2 flex-wrap">
              <span className="text-slate-600">{task.partnerName}</span>

              {task.dueDate && (
                <span
                  className={`flex items-center gap-1 ${
                    taskIsOverdue ? "text-red-500 font-medium" : ""
                  }`}
                >
                  {taskIsOverdue ? (
                    <AlertCircle size={10} />
                  ) : (
                    <Calendar size={10} />
                  )}
                  {formatDate(task.dueDate)}
                </span>
              )}

              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  task.status === "Complete"
                    ? "bg-green-50 text-green-700"
                    : task.status === "In Progress"
                      ? "bg-blue-50 text-blue-700"
                      : task.status === "Waiting"
                        ? "bg-yellow-50 text-yellow-700"
                        : "bg-slate-50 text-slate-700"
                }`}
              >
                {task.status}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setEditingPartnerTask(task);
                  setEditPartnerTaskTitle(task.title);
                  setEditPartnerTaskNotes(task.notes || "");
                  setEditPartnerTaskDueDate(task.dueDate || "");
                }}
                className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
              >
                <Pencil size={10} />
                Edit
              </button>
              <a
                href={`https://partner-management-application.vercel.app/tasks`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
              >
                <ExternalLink size={10} />
                CRM
              </a>
              <select
                value={task.status}
                onChange={(e) =>
                  handlePartnerTaskStatusChange(
                    task.id,
                    e.target.value as CrmTaskStatus,
                    task.type
                  )
                }
                onClick={(e) => e.stopPropagation()}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors cursor-pointer border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Waiting">Waiting</option>
                <option value="Paused">Paused</option>
                <option value="Complete">Complete</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWorkAreaCard = (
    workAreaId: string,
    name: string,
    color: string,
    icon: React.ReactNode
  ) => {
    const tasks = tasksByWorkArea.get(workAreaId) || [];

    return (
      <div
        key={workAreaId}
        className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
      >
        {/* Header */}
        <div
          className="px-4 py-3 border-b border-slate-200"
          style={{ backgroundColor: `${color}15` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: color }}
              >
                {icon}
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">{name}</h3>
                <p className="text-xs text-slate-500">{tasks.length} tasks</p>
              </div>
            </div>
          </div>
        </div>

        {/* Task List - Fixed Height with Scroll */}
        <div className="h-96 overflow-y-auto p-3">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <CheckCircle2 size={32} className="mb-2" />
              <p className="text-sm">All caught up!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => renderTaskCard(task))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
          <ListTodo className="text-indigo-500" size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">All Tasks</h2>
          <p className="text-sm text-slate-500">
            {activeTasks.length} active task{activeTasks.length !== 1 ? "s" : ""} across all work areas
          </p>
        </div>
      </div>

      {/* Work Area Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Partner Tasks */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {/* Header */}
          <div
            className="px-4 py-3 border-b border-slate-200"
            style={{ backgroundColor: "#8b5cf615" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#6b96b0" }}
                >
                  <Users className="text-white" size={16} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">
                    Partner Tasks
                  </h3>
                  <p className="text-xs text-slate-500">
                    {loadingPartnerTasks ? "Loading..." : `${partnerTasks.length} tasks`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Task List - Fixed Height with Scroll */}
          <div className="h-96 overflow-y-auto p-3">
            {loadingPartnerTasks ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Clock size={32} className="mb-2 animate-spin" />
                <p className="text-sm">Loading partner tasks...</p>
              </div>
            ) : partnerTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <CheckCircle2 size={32} className="mb-2" />
                <p className="text-sm">All caught up!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {partnerTasks.map((task) => renderPartnerTaskCard(task))}
              </div>
            )}
          </div>
        </div>

        {/* Render each work area */}
        {state.workAreas.map((workArea) =>
          renderWorkAreaCard(
            workArea.id,
            workArea.name,
            workArea.color,
            <div className="w-full h-full" />
          )
        )}

        {/* Unassigned Tasks */}
        {renderWorkAreaCard(
          "unassigned",
          "Unassigned",
          "#94a3b8",
          <Inbox className="text-white" size={16} />
        )}
      </div>

      {/* Task Edit Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Partner Task Edit Modal */}
      {editingPartnerTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Edit Partner Task
              </h3>
              <button
                onClick={() => setEditingPartnerTask(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Task
                </label>
                <input
                  type="text"
                  value={editPartnerTaskTitle}
                  onChange={(e) => setEditPartnerTaskTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {editingPartnerTask.type !== "onboarding" && (
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Notes
                  </label>
                  <textarea
                    value={editPartnerTaskNotes}
                    onChange={(e) => setEditPartnerTaskNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder="Add notes..."
                  />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={editPartnerTaskDueDate}
                  onChange={(e) => setEditPartnerTaskDueDate(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="text-xs text-slate-400">
                Partner: {editingPartnerTask.partnerName}
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => setEditingPartnerTask(null)}
                  className="px-4 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePartnerTask}
                  disabled={!editPartnerTaskTitle.trim() || savingPartnerTask}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingPartnerTask ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
