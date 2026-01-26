"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  Filter,
  ListTodo,
  Loader2,
  AlertTriangle,
  Search,
  Pause,
  Play,
  Hourglass,
  Plus,
  X,
  ExternalLink,
} from "lucide-react";
import {
  crmSupabase,
  CrmFollowUpTask,
  CrmPartner,
  TaskStatus,
  TASK_STATUS_OPTIONS,
  taskStatusColors,
} from "@/lib/crm-supabase";
import Sidebar from "@/components/Sidebar";

interface TaskItem {
  id: string;
  type: "task" | "onboarding" | "followup";
  title: string;
  dueDate: string | null;
  completed: boolean;
  status: TaskStatus;
  partnerId: string;
  partnerName: string;
  notes?: string;
  touchpointId?: string;
}

type FilterType = "all" | "task" | "onboarding" | "followup";
type StatusFilter = TaskStatus | "all" | "active";

export default function PartnerTasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [partners, setPartners] = useState<CrmPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPartnerId, setNewTaskPartnerId] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);

  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [editTaskText, setEditTaskText] = useState("");
  const [editTaskNotes, setEditTaskNotes] = useState("");
  const [editTaskDueDate, setEditTaskDueDate] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: partnersData, error: partnersError } = await crmSupabase
        .from("partners")
        .select("id, name, status")
        .order("name");

      if (partnersError) throw partnersError;
      setPartners(partnersData || []);

      const { data: followUpData, error: followUpError } = await crmSupabase
        .from("follow_up_tasks")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false });

      if (followUpError) throw followUpError;

      const { data: onboardingData, error: onboardingError } = await crmSupabase
        .from("onboarding_tasks")
        .select("*")
        .not("due_date", "is", null);

      if (onboardingError) throw onboardingError;

      const taskItems: TaskItem[] = [];

      (followUpData || []).forEach((task: CrmFollowUpTask) => {
        const partner = partnersData?.find((p) => p.id === task.partner_id);
        taskItems.push({
          id: task.id,
          type: task.touchpoint_id ? "followup" : "task",
          title: task.task,
          dueDate: task.due_date,
          completed: task.completed,
          status: (task.status as TaskStatus) || "Not Started",
          partnerId: task.partner_id || "",
          partnerName: partner?.name || "Unknown Partner",
          notes: task.notes,
          touchpointId: task.touchpoint_id || undefined,
        });
      });

      (onboardingData || []).forEach((task: any) => {
        const partner = partnersData?.find((p) => p.id === task.partner_id);
        taskItems.push({
          id: task.id,
          type: "onboarding",
          title: task.title,
          dueDate: task.due_date,
          completed: task.status === "Complete",
          status: task.status === "Complete" ? "Complete" : "Not Started",
          partnerId: task.partner_id,
          partnerName: partner?.name || "Unknown Partner",
        });
      });

      setTasks(taskItems);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const subscription = crmSupabase
      .channel("follow_up_tasks_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follow_up_tasks" },
        () => {
          fetchData();
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const today = new Date().toISOString().split("T")[0];

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return dueDate < today;
  };

  const isDueToday = (dueDate: string | null) => {
    if (!dueDate) return false;
    return dueDate === today;
  };

  // Helper to check if a task is completed (handles different status values)
  const isTaskCompleted = (status: string) => {
    const lowerStatus = status.toLowerCase();
    return (
      lowerStatus === "complete" ||
      lowerStatus === "completed" ||
      lowerStatus === "na"
    );
  };

  let filteredItems = [...tasks];

  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredItems = filteredItems.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.partnerName.toLowerCase().includes(query),
    );
  }

  if (typeFilter !== "all") {
    filteredItems = filteredItems.filter((item) => item.type === typeFilter);
  }

  if (statusFilter === "active") {
    filteredItems = filteredItems.filter(
      (item) => !isTaskCompleted(item.status),
    );
  } else if (statusFilter !== "all") {
    filteredItems = filteredItems.filter(
      (item) => item.status === statusFilter,
    );
  }

  if (partnerFilter !== "all") {
    filteredItems = filteredItems.filter(
      (item) => item.partnerId === partnerFilter,
    );
  }

  filteredItems.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const activeCount = tasks.filter(
    (item) => !isTaskCompleted(item.status),
  ).length;
  const overdueCount = tasks.filter(
    (item) => !isTaskCompleted(item.status) && isOverdue(item.dueDate),
  ).length;
  const dueTodayCount = tasks.filter(
    (item) => !isTaskCompleted(item.status) && isDueToday(item.dueDate),
  ).length;

  const getTypeLabel = (type: TaskItem["type"]) => {
    switch (type) {
      case "task":
        return "Task";
      case "followup":
        return "Follow-up";
      case "onboarding":
        return "Onboarding";
    }
  };

  const getTypeColor = (type: TaskItem["type"]) => {
    switch (type) {
      case "task":
        return "bg-blue-100 text-blue-800";
      case "followup":
        return "bg-purple-100 text-purple-800";
      case "onboarding":
        return "bg-teal-100 text-teal-800";
    }
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case "Complete":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "In Progress":
        return <Play className="h-5 w-5 text-blue-600" />;
      case "Waiting":
        return <Hourglass className="h-5 w-5 text-yellow-600" />;
      case "Paused":
        return <Pause className="h-5 w-5 text-orange-600" />;
      default:
        return <Circle className="h-5 w-5 text-gray-400" />;
    }
  };

  const handleStatusChange = async (
    taskId: string,
    newStatus: TaskStatus,
    taskType: TaskItem["type"],
  ) => {
    if (taskType === "onboarding") {
      setUpdatingTaskId(taskId);
      try {
        const { error: updateError } = await crmSupabase
          .from("onboarding_tasks")
          .update({ status: newStatus })
          .eq("id", taskId);
        if (updateError) throw updateError;
        await fetchData();
      } catch (err) {
        console.error("Error updating onboarding task:", err);
      } finally {
        setUpdatingTaskId(null);
      }
      return;
    }

    setUpdatingTaskId(taskId);
    try {
      const { error: updateError } = await crmSupabase
        .from("follow_up_tasks")
        .update({
          status: newStatus,
          completed: newStatus === "Complete",
        })
        .eq("id", taskId);
      if (updateError) throw updateError;
      await fetchData();
    } catch (err) {
      console.error("Error updating task status:", err);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskText.trim() || !newTaskPartnerId) return;

    setIsAddingTask(true);
    try {
      const { error: insertError } = await crmSupabase
        .from("follow_up_tasks")
        .insert({
          partner_id: newTaskPartnerId,
          task: newTaskText.trim(),
          due_date: newTaskDueDate || null,
          completed: false,
          status: "Not Started",
        });
      if (insertError) throw insertError;

      setNewTaskText("");
      setNewTaskDueDate("");
      setNewTaskPartnerId("");
      setShowAddTask(false);
      await fetchData();
    } catch (err) {
      console.error("Error adding task:", err);
    } finally {
      setIsAddingTask(false);
    }
  };

  const openEditModal = (task: TaskItem) => {
    setEditingTask(task);
    setEditTaskText(task.title);
    setEditTaskNotes(task.notes || "");
    setEditTaskDueDate(task.dueDate || "");
  };

  const handleSaveEdit = async () => {
    if (!editingTask || !editTaskText.trim()) return;

    setIsSavingEdit(true);
    try {
      if (editingTask.type === "onboarding") {
        const { error: updateError } = await crmSupabase
          .from("onboarding_tasks")
          .update({
            title: editTaskText.trim(),
            due_date: editTaskDueDate || null,
          })
          .eq("id", editingTask.id);
        if (updateError) throw updateError;
      } else {
        const { error: updateError } = await crmSupabase
          .from("follow_up_tasks")
          .update({
            task: editTaskText.trim(),
            notes: editTaskNotes || null,
            due_date: editTaskDueDate || null,
          })
          .eq("id", editingTask.id);
        if (updateError) throw updateError;
      }

      setEditingTask(null);
      await fetchData();
    } catch (err) {
      console.error("Error saving task:", err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (loading) {
    return (
      <Sidebar>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
        </div>
      </Sidebar>
    );
  }

  if (error) {
    return (
      <Sidebar>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600">Error loading tasks: {error}</p>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Retry
            </button>
          </div>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <ListTodo className="h-6 w-6" />
              Partner Tasks
            </h1>
            <p className="mt-1 text-slate-500">
              Manage tasks from CRM - changes sync automatically
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="https://partner-management-application.vercel.app/tasks"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" />
              Open in CRM
            </a>
            <button
              onClick={() => setShowAddTask(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add Task
            </button>
          </div>
        </div>

        {showAddTask && (
          <div className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">New Task</h3>
              <button
                onClick={() => {
                  setShowAddTask(false);
                  setNewTaskText("");
                  setNewTaskDueDate("");
                  setNewTaskPartnerId("");
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Partner *
                </label>
                <select
                  value={newTaskPartnerId}
                  onChange={(e) => setNewTaskPartnerId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select a partner...</option>
                  {partners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Task *
                </label>
                <input
                  type="text"
                  placeholder="Enter task description..."
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAddTask(false);
                    setNewTaskText("");
                    setNewTaskDueDate("");
                    setNewTaskPartnerId("");
                  }}
                  className="px-4 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddTask}
                  disabled={
                    !newTaskText.trim() || !newTaskPartnerId || isAddingTask
                  }
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isAddingTask ? "Adding..." : "Add Task"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
            <p className="text-3xl font-bold text-slate-900">{activeCount}</p>
            <p className="text-sm text-slate-500">Active Tasks</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
            <p className="text-3xl font-bold text-amber-600">{dueTodayCount}</p>
            <p className="text-sm text-slate-500">Due Today</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
            <p className="text-3xl font-bold text-red-600">{overdueCount}</p>
            <p className="text-sm text-slate-500">Overdue</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search tasks or partners..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm"
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-slate-500" />
            <h3 className="font-medium text-slate-900">Filters</h3>
          </div>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-sm font-medium text-slate-600 block mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="active">Active (Not Complete)</option>
                <option value="all">All</option>
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Waiting">Waiting</option>
                <option value="Paused">Paused</option>
                <option value="Complete">Complete</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 block mb-1">
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as FilterType)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="all">All Types</option>
                <option value="task">Tasks</option>
                <option value="followup">Follow-ups</option>
                <option value="onboarding">Onboarding</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600 block mb-1">
                Partner
              </label>
              <select
                value={partnerFilter}
                onChange={(e) => setPartnerFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="all">All Partners</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">
              {filteredItems.length}{" "}
              {filteredItems.length === 1 ? "Task" : "Tasks"}
            </h3>
          </div>
          <div className="p-4">
            {filteredItems.length === 0 ? (
              <p className="text-center text-slate-500 py-8">
                No tasks match your filters
              </p>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-4 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${
                      item.status === "Complete" ? "opacity-60" : ""
                    }`}
                    onClick={() => openEditModal(item)}
                  >
                    <div className="mt-0.5 shrink-0">
                      {updatingTaskId === item.id ? (
                        <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
                      ) : (
                        getStatusIcon(item.status)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm ${item.status === "Complete" ? "line-through text-slate-400" : "text-slate-900"}`}
                      >
                        {item.title}
                      </p>
                      {item.notes && (
                        <p className="text-xs text-slate-400 mt-1 truncate">
                          {item.notes}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${getTypeColor(item.type)}`}
                        >
                          {getTypeLabel(item.type)}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${taskStatusColors[item.status]}`}
                        >
                          {item.status}
                        </span>
                        <span className="text-xs text-slate-500">
                          {item.partnerName}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {item.dueDate && (
                        <div
                          className={`flex items-center gap-1 text-sm ${
                            item.status === "Complete"
                              ? "text-slate-400"
                              : isOverdue(item.dueDate)
                                ? "text-red-600 font-medium"
                                : isDueToday(item.dueDate)
                                  ? "text-amber-600 font-medium"
                                  : "text-slate-500"
                          }`}
                        >
                          <Clock className="h-4 w-4" />
                          {isOverdue(item.dueDate) &&
                          !isTaskCompleted(item.status)
                            ? "Overdue"
                            : isDueToday(item.dueDate) &&
                                !isTaskCompleted(item.status)
                              ? "Today"
                              : formatDate(item.dueDate)}
                        </div>
                      )}
                      <select
                        value={item.status}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleStatusChange(
                            item.id,
                            e.target.value as TaskStatus,
                            item.type,
                          );
                        }}
                        onClick={(e) => e.stopPropagation()}
                        disabled={updatingTaskId === item.id}
                        className={`rounded-lg border border-slate-200 px-2 py-1 text-xs ${taskStatusColors[item.status]}`}
                      >
                        {TASK_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {editingTask && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-lg mx-4 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Edit Task</h3>
                <button
                  onClick={() => setEditingTask(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Task
                  </label>
                  <input
                    type="text"
                    value={editTaskText}
                    onChange={(e) => setEditTaskText(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                {editingTask.type !== "onboarding" && (
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">
                      Notes
                    </label>
                    <textarea
                      value={editTaskNotes}
                      onChange={(e) => setEditTaskNotes(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
                    value={editTaskDueDate}
                    onChange={(e) => setEditTaskDueDate(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    Status
                  </label>
                  <select
                    value={editingTask.status}
                    onChange={(e) => {
                      handleStatusChange(
                        editingTask.id,
                        e.target.value as TaskStatus,
                        editingTask.type,
                      );
                      setEditingTask({
                        ...editingTask,
                        status: e.target.value as TaskStatus,
                      });
                    }}
                    className={`rounded-lg border border-slate-200 px-3 py-2 text-sm ${taskStatusColors[editingTask.status]}`}
                  >
                    {TASK_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-slate-400">
                  Partner: {editingTask.partnerName} | Type:{" "}
                  {getTypeLabel(editingTask.type)}
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={!editTaskText.trim() || isSavingEdit}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSavingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
