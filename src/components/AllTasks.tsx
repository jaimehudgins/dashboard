"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  ChevronDown,
  AlertCircle,
  Clock,
  Play,
  CheckCircle2,
  Pencil,
  Circle,
  Briefcase,
  Calendar,
  ListTodo,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task, Priority, TaskStatus } from "@/types";
import { format, startOfDay } from "date-fns";
import TagBadge from "./TagBadge";
import TaskEditModal from "./TaskEditModal";

interface AllTasksProps {
  onFocusTask?: (task: Task) => void;
}

export default function AllTasks({ onFocusTask }: AllTasksProps) {
  const { state, dispatch } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Filter states
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedWorkAreas, setSelectedWorkAreas] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<TaskStatus[]>([]);
  const [dueDateFilter, setDueDateFilter] = useState<
    "all" | "today" | "week" | "overdue" | "none"
  >("all");

  // Get active tasks (not completed, not subtasks)
  const activeTasks = useMemo(() => {
    return state.tasks
      .filter((t) => t.status !== "completed" && !t.parentTaskId)
      .sort((a, b) => {
        // Sort by priority first
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        if (a.priority !== b.priority) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        // Then by due date
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
  }, [state.tasks]);

  // Apply filters
  const filteredTasks = useMemo(() => {
    let tasks = activeTasks;

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tasks = tasks.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (selectedStatuses.length > 0) {
      tasks = tasks.filter((task) => selectedStatuses.includes(task.status));
    }

    // Project filter
    if (selectedProjects.length > 0) {
      tasks = tasks.filter((task) =>
        task.projectId ? selectedProjects.includes(task.projectId) : false
      );
    }

    // Work area filter
    if (selectedWorkAreas.length > 0) {
      tasks = tasks.filter((task) =>
        task.workAreaId ? selectedWorkAreas.includes(task.workAreaId) : false
      );
    }

    // Priority filter
    if (selectedPriorities.length > 0) {
      tasks = tasks.filter((task) =>
        selectedPriorities.includes(task.priority)
      );
    }

    // Tag filter
    if (selectedTags.length > 0) {
      tasks = tasks.filter((task) =>
        task.tagIds?.some((tagId) => selectedTags.includes(tagId))
      );
    }

    // Due date filter
    if (dueDateFilter !== "all") {
      const today = startOfDay(new Date());
      const weekFromNow = new Date(today);
      weekFromNow.setDate(weekFromNow.getDate() + 7);

      tasks = tasks.filter((task) => {
        if (dueDateFilter === "none") {
          return !task.dueDate;
        }
        if (!task.dueDate) return false;

        const dueDate = startOfDay(new Date(task.dueDate));

        if (dueDateFilter === "today") {
          return dueDate.getTime() === today.getTime();
        } else if (dueDateFilter === "week") {
          return dueDate >= today && dueDate < weekFromNow;
        } else if (dueDateFilter === "overdue") {
          return dueDate < today;
        }
        return true;
      });
    }

    return tasks;
  }, [
    activeTasks,
    searchQuery,
    selectedStatuses,
    selectedProjects,
    selectedWorkAreas,
    selectedPriorities,
    selectedTags,
    dueDateFilter,
  ]);

  const toggleArrayFilter = <T,>(
    value: T,
    currentArray: T[],
    setter: React.Dispatch<React.SetStateAction<T[]>>
  ) => {
    if (currentArray.includes(value)) {
      setter(currentArray.filter((v) => v !== value));
    } else {
      setter([...currentArray, value]);
    }
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedProjects([]);
    setSelectedWorkAreas([]);
    setSelectedTags([]);
    setSelectedPriorities([]);
    setSelectedStatuses([]);
    setDueDateFilter("all");
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedProjects.length > 0 ||
    selectedWorkAreas.length > 0 ||
    selectedTags.length > 0 ||
    selectedPriorities.length > 0 ||
    selectedStatuses.length > 0 ||
    dueDateFilter !== "all";

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
        return "text-red-600 bg-red-50 border-red-200";
      case "high":
        return "text-orange-600 bg-orange-50 border-orange-200";
      case "medium":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "low":
        return "text-slate-600 bg-slate-50 border-slate-200";
    }
  };

  const isOverdue = (task: Task) => {
    if (!task.dueDate) return false;
    const today = startOfDay(new Date());
    const dueDate = startOfDay(new Date(task.dueDate));
    return dueDate < today;
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
            {filteredTasks.length} active task{filteredTasks.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        {/* Search */}
        <div className="relative mb-3">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showFilters
                ? "bg-indigo-100 text-indigo-700"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Filter size={16} />
            Filters
            <ChevronDown
              size={16}
              className={`transition-transform ${showFilters ? "rotate-180" : ""}`}
            />
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg space-y-4">
            {/* Status */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Status
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "pending", label: "Pending" },
                  { value: "in_progress", label: "In Progress" },
                  { value: "blocked", label: "Blocked" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() =>
                      toggleArrayFilter(
                        option.value as TaskStatus,
                        selectedStatuses,
                        setSelectedStatuses
                      )
                    }
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      selectedStatuses.includes(option.value as TaskStatus)
                        ? "bg-indigo-600 text-white"
                        : "bg-white border border-slate-300 text-slate-700 hover:border-indigo-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Priority
              </label>
              <div className="flex flex-wrap gap-2">
                {(["critical", "high", "medium", "low"] as Priority[]).map(
                  (priority) => (
                    <button
                      key={priority}
                      onClick={() =>
                        toggleArrayFilter(
                          priority,
                          selectedPriorities,
                          setSelectedPriorities
                        )
                      }
                      className={`px-3 py-1 rounded-full text-sm capitalize transition-colors ${
                        selectedPriorities.includes(priority)
                          ? "bg-indigo-600 text-white"
                          : "bg-white border border-slate-300 text-slate-700 hover:border-indigo-300"
                      }`}
                    >
                      {priority}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Due Date */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Due Date
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "all", label: "All" },
                  { value: "overdue", label: "Overdue" },
                  { value: "today", label: "Today" },
                  { value: "week", label: "This Week" },
                  { value: "none", label: "No Due Date" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() =>
                      setDueDateFilter(option.value as typeof dueDateFilter)
                    }
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      dueDateFilter === option.value
                        ? "bg-indigo-600 text-white"
                        : "bg-white border border-slate-300 text-slate-700 hover:border-indigo-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Projects */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Projects
              </label>
              <div className="flex flex-wrap gap-2">
                {state.projects
                  .filter((p) => !p.archived)
                  .map((project) => (
                    <button
                      key={project.id}
                      onClick={() =>
                        toggleArrayFilter(
                          project.id,
                          selectedProjects,
                          setSelectedProjects
                        )
                      }
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        selectedProjects.includes(project.id)
                          ? "bg-indigo-600 text-white"
                          : "bg-white border border-slate-300 text-slate-700 hover:border-indigo-300"
                      }`}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ backgroundColor: project.color }}
                      />
                      {project.name}
                    </button>
                  ))}
              </div>
            </div>

            {/* Work Areas */}
            {state.workAreas.length > 0 && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Work Areas
                </label>
                <div className="flex flex-wrap gap-2">
                  {state.workAreas.map((workArea) => (
                    <button
                      key={workArea.id}
                      onClick={() =>
                        toggleArrayFilter(
                          workArea.id,
                          selectedWorkAreas,
                          setSelectedWorkAreas
                        )
                      }
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        selectedWorkAreas.includes(workArea.id)
                          ? "bg-indigo-600 text-white"
                          : "bg-white border border-slate-300 text-slate-700 hover:border-indigo-300"
                      }`}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ backgroundColor: workArea.color }}
                      />
                      {workArea.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {state.tags.length > 0 && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {state.tags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() =>
                        toggleArrayFilter(tag.id, selectedTags, setSelectedTags)
                      }
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        selectedTags.includes(tag.id)
                          ? "bg-indigo-600 text-white"
                          : "bg-white border border-slate-300 text-slate-700 hover:border-indigo-300"
                      }`}
                      style={
                        selectedTags.includes(tag.id)
                          ? {}
                          : { borderColor: tag.color, color: tag.color }
                      }
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-12 text-center">
          <ListTodo className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-slate-900 font-medium mb-2">
            {hasActiveFilters ? "No tasks found" : "No active tasks"}
          </h3>
          <p className="text-sm text-slate-500">
            {hasActiveFilters
              ? "Try adjusting your filters or search query"
              : "All tasks are completed. Great work!"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const project = state.projects.find((p) => p.id === task.projectId);
            const workArea = task.workAreaId
              ? state.workAreas.find((w) => w.id === task.workAreaId)
              : null;
            const taskIsOverdue = isOverdue(task);

            return (
              <div
                key={task.id}
                className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-4">
                  {/* Status Indicator */}
                  <button
                    onClick={() => handleComplete(task)}
                    className="flex-shrink-0 mt-1 text-slate-400 hover:text-green-500 transition-colors"
                  >
                    <Circle size={20} />
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title and Priority */}
                    <div className="flex items-start gap-3 mb-2">
                      <h4 className="text-slate-900 font-medium flex-1">
                        {task.title}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </span>
                    </div>

                    {/* Description */}
                    {task.description && (
                      <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap mb-3">
                      {project && (
                        <span className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          {project.name}
                        </span>
                      )}

                      {workArea && (
                        <span className="flex items-center gap-1.5">
                          <Briefcase size={12} />
                          {workArea.name}
                        </span>
                      )}

                      {task.dueDate && (
                        <span
                          className={`flex items-center gap-1.5 ${
                            taskIsOverdue ? "text-red-500 font-medium" : ""
                          }`}
                        >
                          {taskIsOverdue ? (
                            <AlertCircle size={12} />
                          ) : (
                            <Calendar size={12} />
                          )}
                          {taskIsOverdue ? "Overdue: " : "Due: "}
                          {format(new Date(task.dueDate), "MMM d")}
                        </span>
                      )}

                      {task.focusMinutes > 0 && (
                        <span className="flex items-center gap-1.5">
                          <Clock size={12} />
                          {task.focusMinutes}m focused
                        </span>
                      )}

                      {task.status === "in_progress" && (
                        <span className="text-indigo-600 font-medium">
                          In Progress
                        </span>
                      )}

                      {task.status === "blocked" && (
                        <span className="text-red-600 font-medium">Blocked</span>
                      )}
                    </div>

                    {/* Tags */}
                    {task.tagIds && task.tagIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {task.tagIds.map((tagId) => {
                          const tag = state.tags.find((t) => t.id === tagId);
                          if (!tag) return null;
                          return <TagBadge key={tag.id} tag={tag} size="sm" />;
                        })}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleFocus(task)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Play size={14} />
                        Focus
                      </button>
                      <button
                        onClick={() => setEditingTask(task)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => handleComplete(task)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-600 hover:text-green-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        <CheckCircle2 size={14} />
                        Complete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task Edit Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
