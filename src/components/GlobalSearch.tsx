"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  X,
  CheckCircle2,
  Circle,
  Folder,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task, Project, Priority } from "@/types";
import { useRouter } from "next/navigation";

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  type: "task" | "project";
  item: Task | Project;
  matchedField: string;
}

export default function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const { state, getActiveProjects } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const activeProjects = getActiveProjects();

  // Search logic
  const performSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      const lowerQuery = searchQuery.toLowerCase();
      const searchResults: SearchResult[] = [];

      // Search tasks
      state.tasks.forEach((task) => {
        if (task.title.toLowerCase().includes(lowerQuery)) {
          searchResults.push({
            type: "task",
            item: task,
            matchedField: "title",
          });
        } else if (task.description?.toLowerCase().includes(lowerQuery)) {
          searchResults.push({
            type: "task",
            item: task,
            matchedField: "description",
          });
        }
      });

      // Search projects
      activeProjects.forEach((project) => {
        if (project.name.toLowerCase().includes(lowerQuery)) {
          searchResults.push({
            type: "project",
            item: project,
            matchedField: "name",
          });
        } else if (project.description?.toLowerCase().includes(lowerQuery)) {
          searchResults.push({
            type: "project",
            item: project,
            matchedField: "description",
          });
        }
      });

      // Sort: projects first, then tasks by status (incomplete first)
      searchResults.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "project" ? -1 : 1;
        }
        if (a.type === "task" && b.type === "task") {
          const taskA = a.item as Task;
          const taskB = b.item as Task;
          if (taskA.status === "completed" && taskB.status !== "completed")
            return 1;
          if (taskA.status !== "completed" && taskB.status === "completed")
            return -1;
        }
        return 0;
      });

      setResults(searchResults.slice(0, 20)); // Limit to 20 results
      setSelectedIndex(0);
    },
    [state.tasks, activeProjects]
  );

  useEffect(() => {
    performSearch(query);
  }, [query, performSearch]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case "Escape":
        onClose();
        break;
    }
  };

  const handleSelect = (result: SearchResult) => {
    if (result.type === "project") {
      router.push(`/projects/${result.item.id}`);
    } else {
      const task = result.item as Task;
      if (task.projectId) {
        router.push(`/projects/${task.projectId}?task=${task.id}`);
      } else {
        // Misc task - go to home page
        router.push(`/?task=${task.id}`);
      }
    }
    onClose();
  };

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return "Misc";
    const project = state.projects.find((p) => p.id === projectId);
    return project?.name || "Unknown";
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case "critical":
        return "text-red-500";
      case "high":
        return "text-orange-500";
      case "medium":
        return "text-yellow-500";
      case "low":
        return "text-slate-400";
      default:
        return "text-slate-400";
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-200">
          <Search size={20} className="text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks and projects..."
            className="flex-1 text-lg text-slate-900 placeholder-slate-400 outline-none"
          />
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query && results.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              No results found for "{query}"
            </div>
          )}

          {results.length > 0 && (
            <div className="py-2">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.item.id}`}
                  onClick={() => handleSelect(result)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    index === selectedIndex
                      ? "bg-indigo-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  {result.type === "project" ? (
                    <>
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{
                          backgroundColor: (result.item as Project).color + "20",
                        }}
                      >
                        <Folder
                          size={16}
                          style={{ color: (result.item as Project).color }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900">
                          {(result.item as Project).name}
                        </div>
                        {(result.item as Project).description && (
                          <div className="text-sm text-slate-500 truncate">
                            {(result.item as Project).description}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">
                        Project
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex-shrink-0">
                        {(result.item as Task).status === "completed" ? (
                          <CheckCircle2 size={18} className="text-green-500" />
                        ) : (
                          <Circle size={18} className="text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`font-medium ${
                            (result.item as Task).status === "completed"
                              ? "text-slate-400 line-through"
                              : "text-slate-900"
                          }`}
                        >
                          {(result.item as Task).title}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span>{getProjectName((result.item as Task).projectId)}</span>
                          {(result.item as Task).dueDate && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                {new Date(
                                  (result.item as Task).dueDate!
                                ).toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {(result.item as Task).priority !== "medium" && (
                        <AlertCircle
                          size={16}
                          className={getPriorityColor(
                            (result.item as Task).priority
                          )}
                        />
                      )}
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">
                        Task
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>
          )}

          {!query && (
            <div className="p-8 text-center text-slate-400">
              <Search size={32} className="mx-auto mb-3 opacity-50" />
              <p>Start typing to search across all tasks and projects</p>
              <p className="text-sm mt-2">
                Press <kbd className="px-2 py-1 bg-slate-100 rounded text-xs">↑</kbd>{" "}
                <kbd className="px-2 py-1 bg-slate-100 rounded text-xs">↓</kbd> to navigate,{" "}
                <kbd className="px-2 py-1 bg-slate-100 rounded text-xs">Enter</kbd> to select
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
