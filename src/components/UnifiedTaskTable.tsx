"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  AlertCircle,
  Calendar,
  ListTodo,
  ArrowUp,
  ArrowDown,
  Pencil,
  Play,
  ExternalLink,
  Search,
} from "lucide-react";
import { format, startOfDay, addDays } from "date-fns";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";
import TaskEditModal from "./TaskEditModal";
import {
  crmSupabase,
  isCrmConfigured,
  CrmFollowUpTask,
  TaskStatus as CrmTaskStatus,
} from "@/lib/crm-supabase";

type UnifiedSource = "local" | "partner-followup" | "partner-onboarding";

interface UnifiedRow {
  id: string;
  source: UnifiedSource;
  title: string;
  dueDate: Date | null;
  status: string; // display-friendly
  priority: string; // display-friendly, "" for partner
  area: string; // work area or "Partner"
  areaColor: string;
  // back-refs for actions
  task?: Task;
  partnerId?: string;
  partnerName?: string;
  notes?: string;
}

interface Props {
  onFocusTask?: (task: Task) => void;
  initialDueFilter?: DueFilter;
  compact?: boolean; // hide the filter bar (focused widget, e.g. the brief)
}

type SortKey = "dueDate" | "title" | "status" | "priority" | "area";
type SortDir = "asc" | "desc";

const DUE_FILTERS = [
  { id: "all", label: "All" },
  { id: "soon", label: "Due Soon" },
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This Week" },
  { id: "nodate", label: "No Date" },
] as const;

type DueFilter = (typeof DUE_FILTERS)[number]["id"];

export default function UnifiedTaskTable({
  onFocusTask,
  initialDueFilter,
  compact = false,
}: Props) {
  const { state, dispatch } = useApp();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingPartner, setEditingPartner] = useState<UnifiedRow | null>(null);
  const [partnerEditTitle, setPartnerEditTitle] = useState("");
  const [partnerEditNotes, setPartnerEditNotes] = useState("");
  const [partnerEditDueDate, setPartnerEditDueDate] = useState("");
  const [savingPartner, setSavingPartner] = useState(false);

  const [partnerRows, setPartnerRows] = useState<UnifiedRow[]>([]);
  const [loadingPartner, setLoadingPartner] = useState(true);

  const [search, setSearch] = useState("");
  const [dueFilter, setDueFilter] = useState<DueFilter>(initialDueFilter ?? "all");
  const [areaFilter, setAreaFilter] = useState<string>("all"); // "all" | areaId | "partner" | "unassigned"
  const [statusFilter, setStatusFilter] = useState<string>("active"); // "all" | "active" | "completed"
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchPartnerTasks = async () => {
    if (!isCrmConfigured) {
      setLoadingPartner(false);
      return;
    }
    try {
      setLoadingPartner(true);
      const [{ data: partnersData }, { data: followUpData }, { data: onboardingData }] =
        await Promise.all([
          crmSupabase.from("partners").select("id, name, status").order("name"),
          crmSupabase
            .from("follow_up_tasks")
            .select("*")
            .eq("completed", false),
          crmSupabase
            .from("onboarding_tasks")
            .select("*")
            .not("due_date", "is", null)
            .not("status", "in", '("complete","completed","na","Complete")'),
        ]);

      const rows: UnifiedRow[] = [];
      (followUpData || []).forEach((t: CrmFollowUpTask) => {
        const partner = partnersData?.find((p) => p.id === t.partner_id);
        rows.push({
          id: `fu-${t.id}`,
          source: "partner-followup",
          title: t.task,
          dueDate: t.due_date ? new Date(t.due_date) : null,
          status: (t.status as string) || "Not Started",
          priority: "",
          area: "Partner",
          areaColor: "#6b96b0",
          partnerId: t.partner_id || "",
          partnerName: partner?.name || "Unknown Partner",
          notes: t.notes,
        });
      });
      (onboardingData || []).forEach((t: any) => {
        const partner = partnersData?.find((p) => p.id === t.partner_id);
        rows.push({
          id: `ob-${t.id}`,
          source: "partner-onboarding",
          title: t.title,
          dueDate: t.due_date ? new Date(t.due_date) : null,
          status: t.status || "Not Started",
          priority: "",
          area: "Partner",
          areaColor: "#6b96b0",
          partnerId: t.partner_id,
          partnerName: partner?.name || "Unknown Partner",
        });
      });
      setPartnerRows(rows);
    } catch (err) {
      console.error("Error fetching partner tasks:", err);
    } finally {
      setLoadingPartner(false);
    }
  };

  const focusPartnerRow = (row: UnifiedRow) => {
    const mirrorId = `task-partner-${row.id}`;
    const existing = state.tasks.find((t) => t.id === mirrorId);
    if (existing) {
      onFocusTask?.(existing);
      return;
    }
    const partnerArea =
      state.areas.find((a) => a.name.toLowerCase() === "partner") ||
      state.areas.find((a) => a.name.toLowerCase().includes("partner"));
    const mirror: Task = {
      id: mirrorId,
      title: row.partnerName
        ? `${row.title} (${row.partnerName})`
        : row.title,
      priority: "medium",
      status: "pending",
      projectId: null,
      dueDate: row.dueDate || undefined,
      createdAt: new Date(),
      focusMinutes: 0,
      areaId: partnerArea?.id,
      link: "https://willow-crm-three.vercel.app/tasks",
    };
    dispatch({ type: "ADD_TASK", payload: mirror });
    onFocusTask?.(mirror);
  };

  const openPartnerEditor = (row: UnifiedRow) => {
    setEditingPartner(row);
    setPartnerEditTitle(row.title);
    setPartnerEditNotes(row.notes || "");
    setPartnerEditDueDate(
      row.dueDate ? format(row.dueDate, "yyyy-MM-dd") : "",
    );
  };

  const savePartnerEdit = async () => {
    if (!editingPartner || !partnerEditTitle.trim()) return;
    setSavingPartner(true);
    try {
      const rawId = editingPartner.id.replace(/^(fu|ob)-/, "");
      if (editingPartner.source === "partner-onboarding") {
        const { error } = await crmSupabase
          .from("onboarding_tasks")
          .update({
            title: partnerEditTitle.trim(),
            due_date: partnerEditDueDate || null,
          })
          .eq("id", rawId);
        if (error) throw error;
      } else {
        const { error } = await crmSupabase
          .from("follow_up_tasks")
          .update({
            task: partnerEditTitle.trim(),
            notes: partnerEditNotes || null,
            due_date: partnerEditDueDate || null,
          })
          .eq("id", rawId);
        if (error) throw error;
      }
      setEditingPartner(null);
      fetchPartnerTasks();
    } catch (err) {
      console.error("Error saving partner task:", err);
    } finally {
      setSavingPartner(false);
    }
  };

  useEffect(() => {
    fetchPartnerTasks();
    if (!isCrmConfigured) return;
    const sub = crmSupabase
      .channel("unified_partner_tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follow_up_tasks" },
        () => fetchPartnerTasks(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "onboarding_tasks" },
        () => fetchPartnerTasks(),
      )
      .subscribe();
    return () => {
      sub.unsubscribe();
    };
  }, []);

  const localRows: UnifiedRow[] = useMemo(() => {
    return state.tasks
      .filter((t) => !t.parentTaskId)
      .map((t) => {
        const a = t.areaId
          ? state.areas.find((x) => x.id === t.areaId)
          : null;
        return {
          id: t.id,
          source: "local" as UnifiedSource,
          title: t.title,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          status: t.status,
          priority: t.priority,
          area: a?.name || "Unassigned",
          areaColor: a?.color || "#94a3b8",
          task: t,
        };
      });
  }, [state.tasks, state.areas]);

  const allRows = useMemo(
    () => [...localRows, ...partnerRows],
    [localRows, partnerRows],
  );

  const filteredRows = useMemo(() => {
    const today = startOfDay(new Date());
    const weekEnd = addDays(today, 7);
    const q = search.trim().toLowerCase();

    return allRows.filter((r) => {
      // status
      if (statusFilter === "active") {
        if (r.source === "local") {
          if (r.status === "completed") return false;
        } else {
          if (r.status === "Complete") return false;
        }
      } else if (statusFilter === "completed") {
        if (r.source === "local") {
          if (r.status !== "completed") return false;
        } else {
          if (r.status !== "Complete") return false;
        }
      }

      // area
      if (areaFilter !== "all") {
        if (areaFilter === "partner") {
          if (r.source === "local") return false;
        } else if (areaFilter === "unassigned") {
          if (r.source !== "local" || r.task?.areaId) return false;
        } else {
          if (r.source !== "local" || r.task?.areaId !== areaFilter)
            return false;
        }
      }

      // due
      if (dueFilter !== "all") {
        const d = r.dueDate ? startOfDay(r.dueDate) : null;
        if (dueFilter === "nodate") {
          if (d) return false;
        } else if (dueFilter === "soon") {
          // Overdue or due within the next two days.
          if (!d || d > addDays(today, 2)) return false;
        } else if (dueFilter === "overdue") {
          if (!d || d >= today) return false;
        } else if (dueFilter === "today") {
          if (!d || d.getTime() !== today.getTime()) return false;
        } else if (dueFilter === "tomorrow") {
          if (!d || d.getTime() !== addDays(today, 1).getTime()) return false;
        } else if (dueFilter === "week") {
          if (!d || d < today || d > weekEnd) return false;
        }
      }

      // search
      if (q && !r.title.toLowerCase().includes(q)) return false;

      return true;
    });
  }, [allRows, statusFilter, areaFilter, dueFilter, search]);

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    const dir = sortDir === "asc" ? 1 : -1;
    const priorityRank: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    arr.sort((a, b) => {
      switch (sortKey) {
        case "dueDate": {
          const ad = a.dueDate ? a.dueDate.getTime() : Infinity;
          const bd = b.dueDate ? b.dueDate.getTime() : Infinity;
          return (ad - bd) * dir;
        }
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "priority": {
          const ar = priorityRank[a.priority] ?? 99;
          const br = priorityRank[b.priority] ?? 99;
          return (ar - br) * dir;
        }
        case "area":
          return a.area.localeCompare(b.area) * dir;
      }
    });
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleCompleteLocal = (task: Task) => {
    dispatch({
      type: "UPDATE_TASK",
      payload: { ...task, status: "completed" },
    });
  };

  const handleCompletePartner = async (row: UnifiedRow) => {
    const id = row.id.replace(/^(fu|ob)-/, "");
    try {
      setPartnerRows((prev) => prev.filter((r) => r.id !== row.id));
      if (row.source === "partner-onboarding") {
        await crmSupabase
          .from("onboarding_tasks")
          .update({ status: "Complete" })
          .eq("id", id);
      } else {
        await crmSupabase
          .from("follow_up_tasks")
          .update({ status: "Complete", completed: true })
          .eq("id", id);
      }
      fetchPartnerTasks();
    } catch (err) {
      console.error("Error completing partner task:", err);
      fetchPartnerTasks();
    }
  };

  const isOverdue = (d: Date | null, status: string, source: UnifiedSource) => {
    if (!d) return false;
    if (source === "local" && status === "completed") return false;
    if (source !== "local" && status === "Complete") return false;
    return startOfDay(d) < startOfDay(new Date());
  };

  const statusBadge = (row: UnifiedRow) => {
    if (row.source === "local") {
      const s = row.status as Task["status"];
      const cls: Record<string, string> = {
        pending: "bg-slate-50 text-slate-700",
        in_progress: "bg-blue-50 text-blue-700",
        completed: "bg-green-50 text-green-700",
        blocked: "bg-red-50 text-red-700",
      };
      const label = s.replace("_", " ");
      return (
        <span className={`px-1.5 py-0.5 rounded text-xs ${cls[s] || "bg-slate-50 text-slate-700"}`}>
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </span>
      );
    }
    const cls =
      row.status === "Complete"
        ? "bg-green-50 text-green-700"
        : row.status === "In Progress"
          ? "bg-blue-50 text-blue-700"
          : row.status === "Waiting"
            ? "bg-yellow-50 text-yellow-700"
            : "bg-slate-50 text-slate-700";
    return <span className={`px-1.5 py-0.5 rounded text-xs ${cls}`}>{row.status}</span>;
  };

  const priorityBadge = (p: string) => {
    if (!p) return <span className="text-slate-300 text-xs">—</span>;
    const cls: Record<string, string> = {
      critical: "text-red-600 bg-red-50",
      high: "text-orange-600 bg-orange-50",
      medium: "text-yellow-600 bg-yellow-50",
      low: "text-slate-600 bg-slate-50",
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls[p] || ""}`}>
        {p.charAt(0).toUpperCase() + p.slice(1)}
      </span>
    );
  };

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <button
      onClick={() => toggleSort(k)}
      className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
    >
      {label}
      {sortKey === k ? (
        sortDir === "asc" ? (
          <ArrowUp size={12} />
        ) : (
          <ArrowDown size={12} />
        )
      ) : null}
    </button>
  );

  const totalCount = sortedRows.length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
          <ListTodo className="text-indigo-500" size={18} />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">All Tasks</h2>
          <p className="text-xs text-slate-500">
            {loadingPartner ? "Loading partner tasks…" : `${totalCount} task${totalCount !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 space-y-2">
        {!compact && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg bg-white px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Areas</option>
            <option value="partner">Partner</option>
            {state.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="unassigned">Unassigned</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg bg-white px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="all">All Statuses</option>
          </select>
        </div>
        )}

        <div className="flex items-center gap-1 flex-wrap">
          {DUE_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setDueFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                dueFilter === f.id
                  ? "bg-indigo-500 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[640px]">
        <table className="w-full text-sm">
          <thead className="bg-white sticky top-0 z-10 border-b border-slate-200">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="text-left px-3 py-2">
                <SortHeader label="Task" k="title" />
              </th>
              <th className="text-left px-3 py-2 w-28">
                <SortHeader label="Due" k="dueDate" />
              </th>
              <th className="text-left px-3 py-2 w-28">
                <SortHeader label="Area" k="area" />
              </th>
              <th className="text-left px-3 py-2 w-28">
                <SortHeader label="Priority" k="priority" />
              </th>
              <th className="text-left px-3 py-2 w-32">
                <SortHeader label="Status" k="status" />
              </th>
              <th className="px-3 py-2 w-32" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center text-slate-400 py-10 text-sm"
                >
                  {search.trim() === "" &&
                  dueFilter === "all" &&
                  areaFilter === "all" &&
                  statusFilter === "active"
                    ? "Nothing right now. Nice work."
                    : "No tasks match these filters."}
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => {
                const overdue = isOverdue(row.dueDate, row.status, row.source);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 hover:bg-slate-50/60"
                  >
                    <td className="px-3 py-2 align-top">
                      <button
                        onClick={() =>
                          row.source === "local"
                            ? handleCompleteLocal(row.task!)
                            : handleCompletePartner(row)
                        }
                        className="w-4 h-4 rounded-full border border-slate-300 hover:border-green-500 hover:bg-green-50 transition-colors"
                        title="Mark complete"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="text-slate-900 font-medium">
                        {row.title}
                      </div>
                      {row.partnerName && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {row.partnerName}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {row.dueDate ? (
                        <span
                          className={`inline-flex items-center gap-1 text-xs ${
                            overdue ? "text-red-600 font-medium" : "text-slate-600"
                          }`}
                        >
                          {overdue ? (
                            <AlertCircle size={12} />
                          ) : (
                            <Calendar size={12} />
                          )}
                          {format(row.dueDate, "MMM d")}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs"
                        style={{ color: row.areaColor }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: row.areaColor }}
                        />
                        {row.area}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {priorityBadge(row.priority)}
                    </td>
                    <td className="px-3 py-2 align-top">{statusBadge(row)}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1 justify-end">
                        {row.source === "local" && row.task && (
                          <>
                            <button
                              onClick={() => onFocusTask?.(row.task!)}
                              className="flex items-center gap-1 px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-xs font-medium"
                              title="Focus"
                            >
                              <Play size={10} />
                            </button>
                            <button
                              onClick={() => setEditingTask(row.task!)}
                              className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium"
                              title="Edit"
                            >
                              <Pencil size={10} />
                            </button>
                          </>
                        )}
                        {row.source !== "local" && (
                          <>
                            <button
                              onClick={() => focusPartnerRow(row)}
                              className="flex items-center gap-1 px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-xs font-medium"
                              title="Focus"
                            >
                              <Play size={10} />
                            </button>
                            <button
                              onClick={() => openPartnerEditor(row)}
                              className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium"
                              title="Edit"
                            >
                              <Pencil size={10} />
                            </button>
                            <a
                              href="https://willow-crm-three.vercel.app/tasks"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium"
                              title="Open in CRM"
                            >
                              <ExternalLink size={10} />
                            </a>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editingTask && (
        <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} />
      )}

      {editingPartner &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Edit Partner Task
                </h3>
                <button
                  onClick={() => setEditingPartner(null)}
                  className="text-slate-400 hover:text-slate-600"
                  aria-label="Close"
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
                    value={partnerEditTitle}
                    onChange={(e) => setPartnerEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                {editingPartner.source === "partner-followup" && (
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">
                      Notes
                    </label>
                    <textarea
                      value={partnerEditNotes}
                      onChange={(e) => setPartnerEditNotes(e.target.value)}
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
                    value={partnerEditDueDate}
                    onChange={(e) => setPartnerEditDueDate(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  Partner: {editingPartner.partnerName}
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={() => setEditingPartner(null)}
                    className="px-4 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={savePartnerEdit}
                    disabled={!partnerEditTitle.trim() || savingPartner}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingPartner ? "Saving..." : "Save Changes"}
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
