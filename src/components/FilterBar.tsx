"use client";

import React from "react";
import { Filter, ArrowUpDown, X, Search } from "lucide-react";
import { useApp } from "@/store/store";
import { Priority, TaskStatus } from "@/types";

export interface TaskFilters {
  priority: Priority | "all";
  status: TaskStatus | "all";
  tagId: string | "all";
  hasDueDate: boolean | "all";
}

export type SortOption =
  | "priority"
  | "dueDate"
  | "created"
  | "title"
  | "focusTime";
export type SortDirection = "asc" | "desc";

interface FilterBarProps {
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  sortBy: SortOption;
  sortDirection: SortDirection;
  onSortChange: (sortBy: SortOption, direction: SortDirection) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const priorityOptions: { value: Priority | "all"; label: string }[] = [
  { value: "all", label: "All Priorities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const statusOptions: { value: TaskStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
];

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "dueDate", label: "Due Date" },
  { value: "created", label: "Created" },
  { value: "title", label: "Title" },
  { value: "focusTime", label: "Focus Time" },
];

export default function FilterBar({
  filters,
  onFiltersChange,
  sortBy,
  sortDirection,
  onSortChange,
  searchQuery,
  onSearchChange,
}: FilterBarProps) {
  const { state } = useApp();

  const hasActiveFilters =
    filters.priority !== "all" ||
    filters.status !== "all" ||
    filters.tagId !== "all" ||
    filters.hasDueDate !== "all";

  const clearFilters = () => {
    onFiltersChange({
      priority: "all",
      status: "all",
      tagId: "all",
      hasDueDate: "all",
    });
  };

  const toggleSortDirection = () => {
    onSortChange(sortBy, sortDirection === "asc" ? "desc" : "asc");
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Search Input */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tasks..."
          className="bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2 py-1 text-xs text-slate-700 w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="w-px h-4 bg-slate-200" />

      <div className="flex items-center gap-1 text-slate-500">
        <Filter size={14} />
        <span className="text-xs font-medium">Filter:</span>
      </div>

      {/* Priority Filter */}
      <select
        value={filters.priority}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            priority: e.target.value as Priority | "all",
          })
        }
        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {priorityOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Status Filter */}
      <select
        value={filters.status}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            status: e.target.value as TaskStatus | "all",
          })
        }
        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {statusOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Tag Filter */}
      <select
        value={filters.tagId}
        onChange={(e) => onFiltersChange({ ...filters, tagId: e.target.value })}
        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="all">All Tags</option>
        {state.tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>

      {/* Due Date Filter */}
      <select
        value={String(filters.hasDueDate)}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            hasDueDate:
              e.target.value === "all" ? "all" : e.target.value === "true",
          })
        }
        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="all">Any Due Date</option>
        <option value="true">Has Due Date</option>
        <option value="false">No Due Date</option>
      </select>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors"
        >
          <X size={12} />
          Clear
        </button>
      )}

      <div className="w-px h-4 bg-slate-200 mx-1" />

      {/* Sort */}
      <div className="flex items-center gap-1 text-slate-500">
        <ArrowUpDown size={14} />
        <span className="text-xs font-medium">Sort:</span>
      </div>

      <select
        value={sortBy}
        onChange={(e) =>
          onSortChange(e.target.value as SortOption, sortDirection)
        }
        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <button
        onClick={toggleSortDirection}
        className={`p-1 rounded hover:bg-slate-100 transition-colors ${
          sortDirection === "desc" ? "text-slate-700" : "text-slate-400"
        }`}
        title={sortDirection === "asc" ? "Ascending" : "Descending"}
      >
        <ArrowUpDown
          size={14}
          className={sortDirection === "desc" ? "rotate-180" : ""}
        />
      </button>
    </div>
  );
}

// Helper function to apply filters and sorting
export function applyFiltersAndSort<
  T extends {
    id: string;
    priority: Priority;
    status: TaskStatus;
    tagIds?: string[];
    dueDate?: Date;
    createdAt: Date;
    title: string;
    focusMinutes: number;
    description?: string;
  },
>(
  tasks: T[],
  filters: TaskFilters,
  sortBy: SortOption,
  sortDirection: SortDirection,
  searchQuery: string = "",
): T[] {
  let filtered = [...tasks];

  // Apply search
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query),
    );
  }

  // Apply filters
  if (filters.priority !== "all") {
    filtered = filtered.filter((t) => t.priority === filters.priority);
  }
  if (filters.status !== "all") {
    filtered = filtered.filter((t) => t.status === filters.status);
  }
  if (filters.tagId !== "all") {
    filtered = filtered.filter((t) =>
      t.tagIds?.includes(filters.tagId as string),
    );
  }
  if (filters.hasDueDate !== "all") {
    filtered = filtered.filter((t) =>
      filters.hasDueDate ? t.dueDate : !t.dueDate,
    );
  }

  // Apply sorting
  const priorityOrder: Record<Priority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  filtered.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case "priority":
        comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
        break;
      case "dueDate":
        if (!a.dueDate && !b.dueDate) comparison = 0;
        else if (!a.dueDate) comparison = 1;
        else if (!b.dueDate) comparison = -1;
        else
          comparison =
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        break;
      case "created":
        comparison =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "title":
        comparison = a.title.localeCompare(b.title);
        break;
      case "focusTime":
        comparison = a.focusMinutes - b.focusMinutes;
        break;
    }

    return sortDirection === "asc" ? comparison : -comparison;
  });

  return filtered;
}
