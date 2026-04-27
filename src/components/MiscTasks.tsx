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
import { Area, Task, Priority } from "@/types";
import TaskEditModal from "./TaskEditModal";
import TagBadge from "./TagBadge";

const areaColors = [
  "#4a7c59", // forest
  "#7a9b6d", // sage
  "#6b96b0", // sky
  "#b07d62", // clay
  "#c4a882", // sand
  "#5a7247", // moss
  "#6b8f5e", // fern
  "#8b8578", // stone
  "#7a8a6b", // olive
  "#6a8490", // slate
];

export default function MiscTasks() {
  const { state, dispatch } = useApp();
  const [showAddArea, setShowAddArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaColor, setNewAreaColor] = useState(areaColors[0]);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [editingAreaName, setEditingAreaName] = useState("");
  const [editingAreaColor, setEditingAreaColor] = useState("");
  const [addingTaskTo, setAddingTaskTo] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Areas + projectless tasks (this view shows tasks with no project, grouped by Area).
  const areas = [...state.areas].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
  );

  const projectlessTasks = state.tasks.filter(
    (t) => t.projectId === null && !t.parentTaskId,
  );

  const getTasksForArea = (areaId: string) =>
    projectlessTasks.filter(
      (t) => t.areaId === areaId && t.status !== "completed",
    );

  const unassignedTasks = projectlessTasks.filter(
    (t) => !t.areaId && t.status !== "completed",
  );

  const handleAddArea = () => {
    if (!newAreaName.trim()) return;

    const newArea: Area = {
      id: crypto.randomUUID(),
      name: newAreaName.trim(),
      color: newAreaColor,
      displayOrder: areas.length,
      isCollapsed: false,
      createdAt: new Date(),
    };

    dispatch({ type: "ADD_AREA", payload: newArea });
    setNewAreaName("");
    setNewAreaColor(areaColors[(areas.length + 1) % areaColors.length]);
    setShowAddArea(false);
  };

  const handleUpdateArea = () => {
    if (!editingAreaName.trim() || !editingArea) {
      setEditingArea(null);
      return;
    }

    dispatch({
      type: "UPDATE_AREA",
      payload: {
        ...editingArea,
        name: editingAreaName.trim(),
        color: editingAreaColor,
      },
    });
    setEditingArea(null);
  };

  const handleDeleteArea = (areaId: string) => {
    dispatch({ type: "DELETE_AREA", payload: areaId });
  };

  const handleAddTask = (areaId: string) => {
    if (!newTaskTitle.trim()) return;

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: newTaskTitle.trim(),
      priority: "medium" as Priority,
      status: "pending",
      projectId: null,
      areaId,
      createdAt: new Date(),
      focusMinutes: 0,
      displayOrder: getTasksForArea(areaId).length,
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

  const toggleArea = (areaId: string) => {
    const newCollapsed = new Set(expandedAreas);
    if (newCollapsed.has(areaId)) {
      newCollapsed.delete(areaId);
    } else {
      newCollapsed.add(areaId);
    }
    setExpandedAreas(newCollapsed);
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

  const renderArea = (area: Area) => {
    const tasks = getTasksForArea(area.id);
    const isCollapsed = !expandedAreas.has(area.id);
    const isAddingTask = addingTaskTo === area.id;

    return (
      <div key={area.id} className="mb-2">
        {/* Area Header */}
        <div className="group flex items-center gap-1 py-1.5 px-2 rounded hover:bg-slate-100 transition-colors">
          <button
            onClick={() => toggleArea(area.id)}
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
            style={{ backgroundColor: area.color }}
          />
          <span className="flex-1 text-sm font-medium text-slate-700 truncate">
            {area.name}
          </span>
          <span className="text-xs text-slate-400">{tasks.length}</span>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
            <button
              onClick={() => setAddingTaskTo(area.id)}
              className="p-0.5 text-slate-400 hover:text-indigo-500"
              title="Add task"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => {
                setEditingArea(area);
                setEditingAreaName(area.name);
                setEditingAreaColor(area.color);
              }}
              className="p-0.5 text-slate-400 hover:text-slate-600"
              title="Edit area"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => handleDeleteArea(area.id)}
              className="p-0.5 text-slate-400 hover:text-red-500"
              title="Delete area"
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
                    if (e.key === "Enter") handleAddTask(area.id);
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
            By Area
          </h3>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between px-3 mb-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          By Area
        </h3>
        <button
          onClick={() => setShowAddArea(true)}
          className="text-slate-400 hover:text-indigo-500 transition-colors"
          title="Add area"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Add Area Form */}
      {showAddArea && (
        <div className="mx-3 mb-2 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddArea();
                if (e.key === "Escape") {
                  setShowAddArea(false);
                  setNewAreaName("");
                }
              }}
              placeholder="Area name..."
              autoFocus
              className="flex-1 text-sm bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={() => {
                setShowAddArea(false);
                setNewAreaName("");
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {areaColors.map((color) => (
              <button
                key={color}
                onClick={() => setNewAreaColor(color)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  newAreaColor === color
                    ? "border-slate-600 scale-110"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          <button
            onClick={handleAddArea}
            disabled={!newAreaName.trim()}
            className="w-full text-sm bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 text-white px-3 py-1.5 rounded transition-colors"
          >
            Add Area
          </button>
        </div>
      )}

      {/* Areas */}
      <div className="px-1">
        {areas.map(renderArea)}

        {/* Unassigned (projectless tasks with no Area) */}
        {unassignedTasks.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-200">
            <div className="px-2 py-1 text-xs text-slate-400 font-medium">
              Unassigned
            </div>
            <div className="ml-2">{unassignedTasks.map(renderTask)}</div>
          </div>
        )}

        {areas.length === 0 &&
          unassignedTasks.length === 0 &&
          !showAddArea && (
            <p className="text-xs text-slate-400 px-3 py-2 italic">
              No areas yet. Click + to add one.
            </p>
          )}
      </div>

      {/* Area Edit Modal - rendered via portal */}
      {editingArea &&
        isMounted &&
        createPortal(
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-slate-900">
                  Edit Area
                </h3>
                <button
                  onClick={() => setEditingArea(null)}
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
                    value={editingAreaName}
                    onChange={(e) => setEditingAreaName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-2">
                    Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {areaColors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setEditingAreaColor(color)}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${
                          editingAreaColor === color
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
                    onClick={() => setEditingArea(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateArea}
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
