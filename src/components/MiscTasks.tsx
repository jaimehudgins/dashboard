"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Trash2,
  Pencil,
  MoreHorizontal,
  X,
  Calendar,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { useApp } from "@/store/store";
import { MiscCategory, Task, Priority } from "@/types";
import TaskEditModal from "./TaskEditModal";
import TagBadge from "./TagBadge";

const categoryColors = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
];

export default function MiscTasks() {
  const { state, dispatch } = useApp();
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(categoryColors[0]);
  const [editingCategory, setEditingCategory] = useState<MiscCategory | null>(
    null,
  );
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryColor, setEditingCategoryColor] = useState("");
  const [addingTaskTo, setAddingTaskTo] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Get misc categories and tasks
  const categories = [...state.miscCategories].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
  );

  const miscTasks = state.tasks.filter(
    (t) => (t.projectId === "misc" || t.projectId === null) && !t.parentTaskId,
  );

  const getTasksForCategory = (categoryId: string) =>
    miscTasks.filter(
      (t) => t.categoryId === categoryId && t.status !== "completed",
    );

  const getCompletedTasksForCategory = (categoryId: string) =>
    miscTasks.filter(
      (t) => t.categoryId === categoryId && t.status === "completed",
    );

  const uncategorizedTasks = miscTasks.filter(
    (t) => !t.categoryId && t.status !== "completed",
  );

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;

    const newCategory: MiscCategory = {
      id: crypto.randomUUID(),
      name: newCategoryName.trim(),
      color: newCategoryColor,
      displayOrder: categories.length,
      isCollapsed: false,
      createdAt: new Date(),
    };

    dispatch({ type: "ADD_CATEGORY", payload: newCategory });
    setNewCategoryName("");
    setNewCategoryColor(
      categoryColors[(categories.length + 1) % categoryColors.length],
    );
    setShowAddCategory(false);
  };

  const handleUpdateCategory = () => {
    if (!editingCategoryName.trim() || !editingCategory) {
      setEditingCategory(null);
      return;
    }

    dispatch({
      type: "UPDATE_CATEGORY",
      payload: {
        ...editingCategory,
        name: editingCategoryName.trim(),
        color: editingCategoryColor,
      },
    });
    setEditingCategory(null);
  };

  const handleDeleteCategory = (categoryId: string) => {
    dispatch({ type: "DELETE_CATEGORY", payload: categoryId });
  };

  const handleAddTask = (categoryId: string) => {
    if (!newTaskTitle.trim()) return;

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: newTaskTitle.trim(),
      priority: "medium" as Priority,
      status: "pending",
      projectId: null,
      categoryId,
      createdAt: new Date(),
      focusMinutes: 0,
      displayOrder: getTasksForCategory(categoryId).length,
    };

    dispatch({ type: "ADD_TASK", payload: newTask });
    setNewTaskTitle("");
    setAddingTaskTo(null);
  };

  const handleToggleTask = (task: Task) => {
    dispatch({
      type: "UPDATE_TASK",
      payload: {
        ...task,
        status: task.status === "completed" ? "pending" : "completed",
      },
    });
  };

  const handleDeleteTask = (taskId: string) => {
    dispatch({ type: "DELETE_TASK", payload: taskId });
  };

  const toggleCategory = (categoryId: string) => {
    const newCollapsed = new Set(expandedCategories);
    if (newCollapsed.has(categoryId)) {
      newCollapsed.delete(categoryId);
    } else {
      newCollapsed.add(categoryId);
    }
    setExpandedCategories(newCollapsed);
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

  const formatDueDate = (date: Date) => {
    const d = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(d);
    taskDate.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil(
      (taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays < 0) return { text: "Overdue", className: "text-red-500" };
    if (diffDays === 0) return { text: "Today", className: "text-amber-500" };
    if (diffDays === 1) return { text: "Tomorrow", className: "text-blue-500" };
    if (diffDays <= 7)
      return { text: `${diffDays}d`, className: "text-slate-500" };
    return {
      text: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      className: "text-slate-400",
    };
  };

  const renderTask = (task: Task) => {
    const taskTags = (task.tagIds || [])
      .map((id) => state.tags.find((t) => t.id === id))
      .filter(Boolean);

    return (
      <div
        key={task.id}
        className="group flex items-start gap-2 py-1.5 px-2 rounded hover:bg-slate-100 transition-colors cursor-pointer"
        onClick={() => setEditingTask(task)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleTask(task);
          }}
          className="flex-shrink-0 mt-0.5"
        >
          {task.status === "completed" ? (
            <CheckCircle2 size={14} className="text-green-500" />
          ) : (
            <Circle size={14} className="text-slate-300 hover:text-slate-500" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {task.priority && task.priority !== "medium" && (
              <AlertCircle
                size={12}
                className={getPriorityColor(task.priority)}
              />
            )}
            <span
              className={`text-sm ${
                task.status === "completed"
                  ? "text-slate-400 line-through"
                  : "text-slate-700"
              }`}
            >
              {task.title}
            </span>
            {task.link && (
              <a
                href={task.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-indigo-400 hover:text-indigo-600"
              >
                <ExternalLink size={10} />
              </a>
            )}
          </div>
          {/* Show additional details */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {task.dueDate && (
              <span
                className={`text-xs flex items-center gap-0.5 ${formatDueDate(task.dueDate).className}`}
              >
                <Calendar size={10} />
                {formatDueDate(task.dueDate).text}
              </span>
            )}
            {taskTags.length > 0 && (
              <div className="flex gap-1">
                {taskTags.slice(0, 2).map((tag) => (
                  <span
                    key={tag!.id}
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${tag!.color}20`,
                      color: tag!.color,
                    }}
                  >
                    {tag!.name}
                  </span>
                ))}
                {taskTags.length > 2 && (
                  <span className="text-xs text-slate-400">
                    +{taskTags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
          {task.description && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {task.description}
            </p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteTask(task.id);
          }}
          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all flex-shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
  };

  const renderCategory = (category: MiscCategory) => {
    const tasks = getTasksForCategory(category.id);
    const completedTasks = getCompletedTasksForCategory(category.id);
    const isCollapsed = !expandedCategories.has(category.id);
    const isAddingTask = addingTaskTo === category.id;

    return (
      <div key={category.id} className="mb-2">
        {/* Category Header */}
        <div className="group flex items-center gap-1 py-1.5 px-2 rounded hover:bg-slate-100 transition-colors">
          <button
            onClick={() => toggleCategory(category.id)}
            className="text-slate-400"
          >
            {isCollapsed ? (
              <ChevronRight size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: category.color }}
          />
          <span className="flex-1 text-sm font-medium text-slate-700 truncate">
            {category.name}
          </span>
          <span className="text-xs text-slate-400">{tasks.length}</span>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
            <button
              onClick={() => setAddingTaskTo(category.id)}
              className="p-0.5 text-slate-400 hover:text-indigo-500"
              title="Add task"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => {
                setEditingCategory(category);
                setEditingCategoryName(category.name);
                setEditingCategoryColor(category.color);
              }}
              className="p-0.5 text-slate-400 hover:text-slate-600"
              title="Edit category"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => handleDeleteCategory(category.id)}
              className="p-0.5 text-slate-400 hover:text-red-500"
              title="Delete category"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Tasks */}
        {!isCollapsed && (
          <div className="ml-5 border-l border-slate-200 pl-2">
            {isAddingTask && (
              <div className="flex items-center gap-2 py-1.5 px-2">
                <Circle size={14} className="text-slate-300 flex-shrink-0" />
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTask(category.id);
                    if (e.key === "Escape") {
                      setAddingTaskTo(null);
                      setNewTaskTitle("");
                    }
                  }}
                  placeholder="Task name..."
                  autoFocus
                  className="flex-1 text-sm bg-white border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={() => {
                    setAddingTaskTo(null);
                    setNewTaskTitle("");
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {tasks.map(renderTask)}
            {tasks.length === 0 && !isAddingTask && (
              <p className="text-xs text-slate-400 py-1.5 px-2 italic">
                No tasks
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  // Don't render until mounted to prevent hydration mismatch
  if (!isMounted) {
    return (
      <div className="pt-4">
        <div className="flex items-center justify-between px-3 mb-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Misc Tasks
          </h3>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between px-3 mb-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Misc Tasks
        </h3>
        <button
          onClick={() => setShowAddCategory(true)}
          className="text-slate-400 hover:text-indigo-500 transition-colors"
          title="Add category"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Add Category Form */}
      {showAddCategory && (
        <div className="mx-3 mb-2 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCategory();
                if (e.key === "Escape") {
                  setShowAddCategory(false);
                  setNewCategoryName("");
                }
              }}
              placeholder="Category name..."
              autoFocus
              className="flex-1 text-sm bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={() => {
                setShowAddCategory(false);
                setNewCategoryName("");
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {categoryColors.map((color) => (
              <button
                key={color}
                onClick={() => setNewCategoryColor(color)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  newCategoryColor === color
                    ? "border-slate-600 scale-110"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          <button
            onClick={handleAddCategory}
            disabled={!newCategoryName.trim()}
            className="w-full text-sm bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 text-white px-3 py-1.5 rounded transition-colors"
          >
            Add Category
          </button>
        </div>
      )}

      {/* Categories */}
      <div className="px-1">
        {categories.map(renderCategory)}

        {/* Uncategorized Tasks */}
        {uncategorizedTasks.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-200">
            <div className="px-2 py-1 text-xs text-slate-400 font-medium">
              Uncategorized
            </div>
            <div className="ml-2">{uncategorizedTasks.map(renderTask)}</div>
          </div>
        )}

        {categories.length === 0 &&
          uncategorizedTasks.length === 0 &&
          !showAddCategory && (
            <p className="text-xs text-slate-400 px-3 py-2 italic">
              No categories yet. Click + to add one.
            </p>
          )}
      </div>

      {/* Category Edit Modal - rendered via portal */}
      {editingCategory &&
        isMounted &&
        createPortal(
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-slate-900">
                  Edit Category
                </h3>
                <button
                  onClick={() => setEditingCategory(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {categoryColors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setEditingCategoryColor(color)}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${
                          editingCategoryColor === color
                            ? "border-slate-600 scale-110"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setEditingCategory(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateCategory}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Task Edit Modal - rendered via portal to escape sidebar overflow */}
      {editingTask &&
        isMounted &&
        createPortal(
          <TaskEditModal
            task={editingTask}
            onClose={() => setEditingTask(null)}
          />,
          document.body,
        )}
    </div>
  );
}
