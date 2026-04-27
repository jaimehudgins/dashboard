"use client";

import React, { useState, useMemo } from "react";
import { X, Search, Filter, Calendar, Tag, Briefcase, Zap } from "lucide-react";
import { useApp } from "@/store/store";
import { Task, FocusSession, Priority } from "@/types";
import { format, isAfter, isBefore, startOfDay } from "date-fns";

interface FocusPickerProps {
  onClose: () => void;
  currentFocusSession?: FocusSession;
  onOpenZenMode: (task: Task) => void;
}

export default function FocusPicker({
  onClose,
  currentFocusSession,
  onOpenZenMode,
}: FocusPickerProps) {
  const { state, dispatch } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>([]);
  const [dueDateFilter, setDueDateFilter] = useState<"all" | "today" | "week" | "overdue">("all");

  // Get available tasks (pending and in_progress only)
  const availableTasks = useMemo(() => {
    return state.tasks.filter(
      (task) =>
        task.status === "pending" || task.status === "in_progress"
    );
  }, [state.tasks]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let tasks = availableTasks;

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tasks = tasks.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
      );
    }

    // Project filter
    if (selectedProjects.length > 0) {
      tasks = tasks.filter((task) =>
        task.projectId ? selectedProjects.includes(task.projectId) : false
      );
    }

    // Tag filter
    if (selectedTags.length > 0) {
      tasks = tasks.filter((task) =>
        task.tagIds?.some((tagId) => selectedTags.includes(tagId))
      );
    }

    // Work area filter
    if (selectedAreas.length > 0) {
      tasks = tasks.filter((task) =>
        task.areaId ? selectedAreas.includes(task.areaId) : false
      );
    }

    // Priority filter
    if (selectedPriorities.length > 0) {
      tasks = tasks.filter((task) =>
        selectedPriorities.includes(task.priority)
      );
    }

    // Due date filter
    if (dueDateFilter !== "all") {
      const today = startOfDay(new Date());
      tasks = tasks.filter((task) => {
        if (!task.dueDate) return false;
        const dueDate = startOfDay(new Date(task.dueDate));

        if (dueDateFilter === "today") {
          return dueDate.getTime() === today.getTime();
        } else if (dueDateFilter === "week") {
          const weekFromNow = new Date(today);
          weekFromNow.setDate(weekFromNow.getDate() + 7);
          return isAfter(dueDate, today) && isBefore(dueDate, weekFromNow);
        } else if (dueDateFilter === "overdue") {
          return isBefore(dueDate, today);
        }
        return true;
      });
    }

    return tasks;
  }, [
    availableTasks,
    searchQuery,
    selectedProjects,
    selectedTags,
    selectedAreas,
    selectedPriorities,
    dueDateFilter,
  ]);

  // Get smart suggestions (high priority tasks due soon)
  const smartSuggestions = useMemo(() => {
    const today = new Date();
    const suggestions = availableTasks
      .filter((task) => {
        if (!task.dueDate) return false;
        const daysUntilDue = Math.ceil(
          (new Date(task.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        return (
          daysUntilDue <= 3 &&
          daysUntilDue >= 0 &&
          (task.priority === "critical" || task.priority === "high")
        );
      })
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        if (a.priority !== b.priority) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        return 0;
      })
      .slice(0, 3);

    return suggestions;
  }, [availableTasks]);

  const handleStartFocus = (task: Task) => {
    if (currentFocusSession) {
      // End current session first
      dispatch({
        type: "END_FOCUS",
        payload: { minutes: 0, notes: "" },
      });
    }

    // Close picker and open ZenMode with the selected task
    // ZenMode will handle starting the focus session
    onClose();
    onOpenZenMode(task);
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

  const getProject = (projectId: string | null) => {
    if (!projectId) return null;
    return state.projects.find((p) => p.id === projectId);
  };

  const getArea = (areaId: string | undefined) => {
    if (!areaId) return null;
    return state.areas.find((a) => a.id === areaId);
  };

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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-20">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-slate-900">
              Choose Your Focus
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          {/* Filter Toggle */}
          <div className="flex items-center gap-2 mt-3">
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
            </button>
            {(selectedProjects.length > 0 ||
              selectedTags.length > 0 ||
              selectedAreas.length > 0 ||
              selectedPriorities.length > 0 ||
              dueDateFilter !== "all") && (
              <button
                onClick={() => {
                  setSelectedProjects([]);
                  setSelectedTags([]);
                  setSelectedAreas([]);
                  setSelectedPriorities([]);
                  setDueDateFilter("all");
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg space-y-4">
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

              {/* Areas */}
              {state.areas.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Areas
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {state.areas.map((area) => (
                      <button
                        key={area.id}
                        onClick={() =>
                          toggleArrayFilter(
                            area.id,
                            selectedAreas,
                            setSelectedAreas
                          )
                        }
                        className={`px-3 py-1 rounded-full text-sm transition-colors ${
                          selectedAreas.includes(area.id)
                            ? "bg-indigo-600 text-white"
                            : "bg-white border border-slate-300 text-slate-700 hover:border-indigo-300"
                        }`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-2"
                          style={{ backgroundColor: area.color }}
                        />
                        {area.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                    { value: "today", label: "Today" },
                    { value: "week", label: "This Week" },
                    { value: "overdue", label: "Overdue" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() =>
                        setDueDateFilter(
                          option.value as typeof dueDateFilter
                        )
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
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Smart Suggestions */}
          {!searchQuery &&
            smartSuggestions.length > 0 &&
            selectedProjects.length === 0 &&
            selectedTags.length === 0 &&
            selectedAreas.length === 0 &&
            selectedPriorities.length === 0 &&
            dueDateFilter === "all" && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="text-yellow-500" size={18} />
                  <h3 className="text-sm font-semibold text-slate-700">
                    Smart Suggestions
                  </h3>
                </div>
                <div className="space-y-2">
                  {smartSuggestions.map((task) => {
                    const project = getProject(task.projectId);
                    const area = getArea(task.areaId);
                    return (
                      <button
                        key={task.id}
                        onClick={() => handleStartFocus(task)}
                        className="w-full text-left p-4 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(
                                  task.priority
                                )}`}
                              >
                                {task.priority}
                              </span>
                              {task.dueDate && (
                                <span className="text-xs text-slate-500">
                                  Due {format(new Date(task.dueDate), "MMM d")}
                                </span>
                              )}
                            </div>
                            <h4 className="font-medium text-slate-900 mb-1">
                              {task.title}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              {project && (
                                <span className="flex items-center gap-1">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: project.color }}
                                  />
                                  {project.name}
                                </span>
                              )}
                              {area && (
                                <span className="flex items-center gap-1">
                                  <Briefcase size={12} />
                                  {area.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          {/* All Tasks */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              All Tasks ({filteredTasks.length})
            </h3>
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <Search className="mx-auto text-slate-300 mb-3" size={48} />
                <p className="text-slate-500">No tasks found</p>
                <p className="text-sm text-slate-400 mt-1">
                  Try adjusting your filters or search query
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task) => {
                  const project = getProject(task.projectId);
                  const area = getArea(task.areaId);
                  const isCurrentFocus =
                    currentFocusSession?.taskId === task.id;

                  return (
                    <button
                      key={task.id}
                      onClick={() => handleStartFocus(task)}
                      disabled={isCurrentFocus}
                      className={`w-full text-left p-4 rounded-lg transition-colors ${
                        isCurrentFocus
                          ? "bg-indigo-50 border-2 border-indigo-500 cursor-not-allowed"
                          : "bg-white border border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(
                                task.priority
                              )}`}
                            >
                              {task.priority}
                            </span>
                            {task.dueDate && (
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Calendar size={12} />
                                {format(new Date(task.dueDate), "MMM d")}
                              </span>
                            )}
                            {isCurrentFocus && (
                              <span className="text-xs text-indigo-600 font-medium">
                                Currently Focusing
                              </span>
                            )}
                          </div>
                          <h4 className="font-medium text-slate-900 mb-1">
                            {task.title}
                          </h4>
                          {task.description && (
                            <p className="text-sm text-slate-500 mb-2 line-clamp-1">
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            {project && (
                              <span className="flex items-center gap-1">
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: project.color }}
                                />
                                {project.name}
                              </span>
                            )}
                            {area && (
                              <span className="flex items-center gap-1">
                                <Briefcase size={12} />
                                {area.name}
                              </span>
                            )}
                            {task.tagIds && task.tagIds.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Tag size={12} />
                                {task.tagIds.length} tag
                                {task.tagIds.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
