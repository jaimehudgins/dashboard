"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  X,
  CheckCircle2,
  Calendar,
  Clock,
  Briefcase,
  Tag as TagIcon,
  ChevronDown,
  History,
} from "lucide-react";
import { useApp } from "@/store/store";
import { format, startOfDay, endOfDay, isWithinInterval, subDays, subMonths } from "date-fns";
import TagBadge from "./TagBadge";

type DateRangePreset = "today" | "week" | "month" | "all" | "custom";

export default function WorkHistory() {
  const { state } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangePreset>("all");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // Get all completed tasks
  const completedTasks = useMemo(() => {
    return state.tasks
      .filter((t) => t.status === "completed" && t.completedAt)
      .sort((a, b) => {
        const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return dateB - dateA; // Most recent first
      });
  }, [state.tasks]);

  // Apply filters
  const filteredTasks = useMemo(() => {
    let tasks = completedTasks;

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tasks = tasks.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
      );
    }

    // Date range filter
    if (dateRange !== "all" && tasks.length > 0) {
      const now = new Date();
      let start: Date;
      let end: Date = endOfDay(now);

      switch (dateRange) {
        case "today":
          start = startOfDay(now);
          break;
        case "week":
          start = startOfDay(subDays(now, 7));
          break;
        case "month":
          start = startOfDay(subMonths(now, 1));
          break;
        case "custom":
          if (customStartDate && customEndDate) {
            start = startOfDay(new Date(customStartDate));
            end = endOfDay(new Date(customEndDate));
          } else {
            start = startOfDay(now);
          }
          break;
        default:
          start = startOfDay(now);
      }

      tasks = tasks.filter((task) => {
        if (!task.completedAt) return false;
        const completedDate = new Date(task.completedAt);
        return isWithinInterval(completedDate, { start, end });
      });
    }

    // Project filter
    if (selectedProjects.length > 0) {
      tasks = tasks.filter((task) =>
        task.projectId ? selectedProjects.includes(task.projectId) : false
      );
    }

    // Work area filter
    if (selectedAreas.length > 0) {
      tasks = tasks.filter((task) =>
        task.areaId ? selectedAreas.includes(task.areaId) : false
      );
    }

    // Tag filter
    if (selectedTags.length > 0) {
      tasks = tasks.filter((task) =>
        task.tagIds?.some((tagId) => selectedTags.includes(tagId))
      );
    }

    return tasks;
  }, [
    completedTasks,
    searchQuery,
    dateRange,
    customStartDate,
    customEndDate,
    selectedProjects,
    selectedAreas,
    selectedTags,
  ]);

  // Group tasks by date
  const groupedTasks = useMemo(() => {
    const groups = new Map<string, typeof filteredTasks>();

    filteredTasks.forEach((task) => {
      if (!task.completedAt) return;
      const dateKey = format(new Date(task.completedAt), "yyyy-MM-dd");
      const existing = groups.get(dateKey);
      if (existing) {
        existing.push(task);
      } else {
        groups.set(dateKey, [task]);
      }
    });

    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTasks]);

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
    setSelectedAreas([]);
    setSelectedTags([]);
    setDateRange("all");
    setCustomStartDate("");
    setCustomEndDate("");
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedProjects.length > 0 ||
    selectedAreas.length > 0 ||
    selectedTags.length > 0 ||
    dateRange !== "all";

  // Calculate stats
  const totalCompleted = filteredTasks.length;
  const totalFocusMinutes = filteredTasks.reduce(
    (sum, task) => sum + (task.focusMinutes || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Work History</h1>
        <p className="text-slate-500 mt-1">
          Review and analyze your completed work
        </p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="text-green-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Tasks Completed</p>
              <p className="text-2xl font-bold text-slate-900">{totalCompleted}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
              <Clock className="text-indigo-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Focus Time</p>
              <p className="text-2xl font-bold text-slate-900">
                {totalFocusMinutes}m
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <History className="text-purple-600" size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Avg per Task</p>
              <p className="text-2xl font-bold text-slate-900">
                {totalCompleted > 0
                  ? Math.round(totalFocusMinutes / totalCompleted)
                  : 0}
                m
              </p>
            </div>
          </div>
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
            placeholder="Search completed tasks..."
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
            {/* Date Range */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Date Range
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { value: "today", label: "Today" },
                  { value: "week", label: "Last 7 Days" },
                  { value: "month", label: "Last 30 Days" },
                  { value: "all", label: "All Time" },
                  { value: "custom", label: "Custom" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() =>
                      setDateRange(option.value as DateRangePreset)
                    }
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      dateRange === option.value
                        ? "bg-indigo-600 text-white"
                        : "bg-white border border-slate-300 text-slate-700 hover:border-indigo-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {dateRange === "custom" && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-slate-600 mb-1 block">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-600 mb-1 block">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
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
            {state.areas.length > 0 && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Work Areas
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

      {/* Results */}
      {groupedTasks.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-12 text-center">
          <CheckCircle2 className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-slate-900 font-medium mb-2">
            {hasActiveFilters ? "No tasks found" : "No completed tasks yet"}
          </h3>
          <p className="text-sm text-slate-500">
            {hasActiveFilters
              ? "Try adjusting your filters or search query"
              : "Start completing tasks to build your work history"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedTasks.map(([dateKey, tasks]) => (
            <div key={dateKey} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Calendar size={18} className="text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-900">
                  {format(new Date(dateKey), "EEEE, MMMM d, yyyy")}
                </h3>
                <span className="text-sm text-slate-500 ml-auto">
                  {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="space-y-3">
                {tasks.map((task) => {
                  const project = state.projects.find(
                    (p) => p.id === task.projectId
                  );
                  const area = task.areaId
                    ? state.areas.find((a) => a.id === task.areaId)
                    : null;

                  return (
                    <div
                      key={task.id}
                      className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <CheckCircle2
                        size={20}
                        className="text-green-500 flex-shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h4 className="text-slate-900 font-medium">
                            {task.title}
                          </h4>
                          {task.completedAt && (
                            <span className="text-xs text-slate-500 flex-shrink-0">
                              {format(new Date(task.completedAt), "h:mm a")}
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p className="text-sm text-slate-600 mb-2 line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          {project && (
                            <span className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: project.color }}
                              />
                              {project.name}
                            </span>
                          )}

                          {area && (
                            <span className="flex items-center gap-1.5">
                              <Briefcase size={12} />
                              {area.name}
                            </span>
                          )}

                          {task.focusMinutes > 0 && (
                            <span className="flex items-center gap-1.5">
                              <Clock size={12} />
                              {task.focusMinutes}m focused
                            </span>
                          )}

                          {task.tagIds && task.tagIds.length > 0 && (
                            <div className="flex items-center gap-1">
                              {task.tagIds.slice(0, 3).map((tagId) => {
                                const tag = state.tags.find((t) => t.id === tagId);
                                if (!tag) return null;
                                return <TagBadge key={tag.id} tag={tag} size="sm" />;
                              })}
                              {task.tagIds.length > 3 && (
                                <span className="text-xs text-slate-400">
                                  +{task.tagIds.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
