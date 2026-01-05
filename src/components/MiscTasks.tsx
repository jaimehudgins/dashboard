"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import { useApp } from "@/store/store";
import { MiscCategory, Task, Priority } from "@/types";

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
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [addingTaskTo, setAddingTaskTo] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );

  // Get misc categories and tasks
  const categories = [...state.miscCategories].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
  );

  const miscTasks = state.tasks.filter(
    (t) => t.projectId === "misc" && !t.parentTaskId,
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
      color: categoryColors[categories.length % categoryColors.length],
      displayOrder: categories.length,
      isCollapsed: false,
      createdAt: new Date(),
    };

    dispatch({ type: "ADD_CATEGORY", payload: newCategory });
    setNewCategoryName("");
    setShowAddCategory(false);
  };

  const handleUpdateCategoryName = (categoryId: string) => {
    if (!editingCategoryName.trim()) {
      setEditingCategory(null);
      return;
    }

    const category = categories.find((c) => c.id === categoryId);
    if (category) {
      dispatch({
        type: "UPDATE_CATEGORY",
        payload: { ...category, name: editingCategoryName.trim() },
      });
    }
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
      projectId: "misc",
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
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(categoryId)) {
      newCollapsed.delete(categoryId);
    } else {
      newCollapsed.add(categoryId);
    }
    setCollapsedCategories(newCollapsed);
  };

  const renderTask = (task: Task) => (
    <div
      key={task.id}
      className="group flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-100 transition-colors"
    >
      <button onClick={() => handleToggleTask(task)} className="flex-shrink-0">
        {task.status === "completed" ? (
          <CheckCircle2 size={14} className="text-green-500" />
        ) : (
          <Circle size={14} className="text-slate-300 hover:text-slate-500" />
        )}
      </button>
      <span
        className={`flex-1 text-sm truncate ${
          task.status === "completed"
            ? "text-slate-400 line-through"
            : "text-slate-700"
        }`}
      >
        {task.title}
      </span>
      <button
        onClick={() => handleDeleteTask(task.id)}
        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );

  const renderCategory = (category: MiscCategory) => {
    const tasks = getTasksForCategory(category.id);
    const completedTasks = getCompletedTasksForCategory(category.id);
    const isCollapsed = collapsedCategories.has(category.id);
    const isEditing = editingCategory === category.id;
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
          {isEditing ? (
            <input
              type="text"
              value={editingCategoryName}
              onChange={(e) => setEditingCategoryName(e.target.value)}
              onBlur={() => handleUpdateCategoryName(category.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUpdateCategoryName(category.id);
                if (e.key === "Escape") setEditingCategory(null);
              }}
              autoFocus
              className="flex-1 text-sm bg-white border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <span className="flex-1 text-sm font-medium text-slate-700 truncate">
              {category.name}
            </span>
          )}
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
                setEditingCategory(category.id);
                setEditingCategoryName(category.name);
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
        <div className="mx-3 mb-2 flex items-center gap-2">
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
    </div>
  );
}
