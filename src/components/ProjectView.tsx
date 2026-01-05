"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Play,
  CheckCircle2,
  Clock,
  Flame,
  AlertCircle,
  Trash2,
  Pencil,
  GripVertical,
  ListChecks,
  Link2,
  Repeat,
  LayoutTemplate,
  List,
  LayoutGrid,
  Calendar,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task, Priority } from "@/types";
import TaskEditModal from "./TaskEditModal";
import TagBadge from "./TagBadge";
import TemplateManager from "./TemplateManager";
import KanbanBoard from "./KanbanBoard";
import CalendarView from "./CalendarView";
import FilterBar, {
  TaskFilters,
  SortOption,
  SortDirection,
  applyFiltersAndSort,
} from "./FilterBar";
import ProgressBar from "./ProgressBar";
import MilestoneManager from "./MilestoneManager";
import ActivityLogPanel from "./ActivityLogPanel";
import ProjectNotes from "./ProjectNotes";

const priorityConfig: Record<
  Priority,
  { color: string; bg: string; label: string }
> = {
  critical: { color: "text-red-600", bg: "bg-red-50", label: "Critical" },
  high: { color: "text-orange-600", bg: "bg-orange-50", label: "High" },
  medium: { color: "text-yellow-600", bg: "bg-yellow-50", label: "Medium" },
  low: { color: "text-slate-500", bg: "bg-slate-100", label: "Low" },
};

interface SortableTaskItemProps {
  task: Task;
  onComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onStartFocus: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

function SortableTaskItem({
  task,
  onComplete,
  onEdit,
  onStartFocus,
  onDelete,
}: SortableTaskItemProps) {
  const { state, getSubtasks, isTaskBlocked } = useApp();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priority = priorityConfig[task.priority];
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  // Get subtasks for this task
  const subtasks = getSubtasks(task.id);
  const completedSubtasks = subtasks.filter((s) => s.status === "completed");
  const hasSubtasks = subtasks.length > 0;

  // Check if task is blocked by dependencies
  const isBlocked = isTaskBlocked(task.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border border-slate-200 rounded-xl p-4 group hover:border-slate-300 hover:shadow-sm transition-all ${
        isDragging ? "opacity-50 shadow-lg" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          {...attributes}
          {...listeners}
          className="mt-1 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>
        <button
          onClick={() => onComplete(task)}
          className="mt-0.5 w-5 h-5 rounded-full border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 transition-colors flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-slate-900 font-medium">{task.title}</p>
          <div className="flex items-center flex-wrap gap-2 mt-2 text-xs">
            <span
              className={`px-2 py-0.5 rounded-full ${priority.bg} ${priority.color}`}
            >
              {priority.label}
            </span>
            {isBlocked && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                <Link2 size={12} />
                Blocked
              </span>
            )}
            {task.dueDate && (
              <span
                className={`flex items-center gap-1 ${isOverdue ? "text-red-500" : "text-slate-500"}`}
              >
                {isOverdue ? <AlertCircle size={12} /> : <Clock size={12} />}
                {format(new Date(task.dueDate), "MMM d")}
              </span>
            )}
            {task.focusMinutes > 0 && (
              <span className="flex items-center gap-1 text-slate-500">
                <Flame size={12} className="text-orange-500" />
                {task.focusMinutes}m
              </span>
            )}
            {hasSubtasks && (
              <span className="flex items-center gap-1 text-slate-500">
                <ListChecks size={12} className="text-indigo-500" />
                {completedSubtasks.length}/{subtasks.length}
              </span>
            )}
            {task.recurrenceRule && (
              <span className="flex items-center gap-1 text-slate-500">
                <Repeat size={12} className="text-purple-500" />
                {task.recurrenceRule}
              </span>
            )}
            {task.tagIds &&
              task.tagIds.map((tagId) => {
                const tag = state.tags.find((t) => t.id === tagId);
                if (!tag) return null;
                return <TagBadge key={tag.id} tag={tag} />;
              })}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(task)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Edit task"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => onStartFocus(task)}
            className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
            aria-label="Start focus session"
          >
            <Play size={16} />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            aria-label="Delete task"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProjectViewProps {
  projectId: string;
  onStartFocus: (task: Task) => void;
}

export default function ProjectView({
  projectId,
  onStartFocus,
}: ProjectViewProps) {
  const { state, dispatch } = useApp();

  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskMilestoneId, setNewTaskMilestoneId] = useState<string>("");
  const [newTaskTagIds, setNewTaskTagIds] = useState<string[]>([]);
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "kanban" | "calendar">(
    "list",
  );
  const [filters, setFilters] = useState<TaskFilters>({
    priority: "all",
    status: "all",
    tagId: "all",
    hasDueDate: "all",
  });
  const [sortBy, setSortBy] = useState<SortOption>("priority");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchQuery, setSearchQuery] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const project = state.projects.find((p) => p.id === projectId);
  // Filter out subtasks - they should only appear under their parent task
  const tasks = state.tasks.filter(
    (t) => t.projectId === projectId && !t.parentTaskId,
  );

  // Apply filters, sorting, and search
  const filteredAndSortedTasks = applyFiltersAndSort(
    tasks,
    filters,
    sortBy,
    sortDirection,
    searchQuery,
  );
  const activeTasks = filteredAndSortedTasks.filter(
    (t) => t.status !== "completed",
  );
  const completedTasks = filteredAndSortedTasks.filter(
    (t) => t.status === "completed",
  );

  if (!project) {
    return <div className="text-slate-900">Project not found</div>;
  }

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const maxOrder = Math.max(
      ...activeTasks.map((t) => t.displayOrder ?? 0),
      0,
    );

    dispatch({
      type: "ADD_TASK",
      payload: {
        id: `task-${Date.now()}`,
        title: newTaskTitle,
        description: newTaskDescription || undefined,
        priority: newTaskPriority,
        status: "pending",
        projectId,
        dueDate: newTaskDueDate ? new Date(newTaskDueDate) : undefined,
        milestoneId: newTaskMilestoneId || undefined,
        tagIds: newTaskTagIds.length > 0 ? newTaskTagIds : undefined,
        createdAt: new Date(),
        focusMinutes: 0,
        displayOrder: maxOrder + 1,
      },
    });

    // Reset form
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskPriority("medium");
    setNewTaskDueDate("");
    setNewTaskMilestoneId("");
    setNewTaskTagIds([]);
    setShowAddTask(false);
  };

  const handleCompleteTask = (task: Task) => {
    dispatch({
      type: "UPDATE_TASK",
      payload: { ...task, status: "completed" },
    });
  };

  const handleDeleteTask = (taskId: string) => {
    dispatch({ type: "DELETE_TASK", payload: taskId });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activeTasks.findIndex((t) => t.id === active.id);
      const newIndex = activeTasks.findIndex((t) => t.id === over.id);

      const reorderedTasks = arrayMove(activeTasks, oldIndex, newIndex);
      const taskIds = reorderedTasks.map((t) => t.id);

      dispatch({
        type: "REORDER_TASKS",
        payload: { projectId, taskIds },
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {project.name}
            </h1>
            {project.description && (
              <p className="text-slate-500 mt-1">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Flame size={14} className="text-orange-500" />
            {project.totalFocusMinutes}m focused
          </div>
          <div>{activeTasks.length} active tasks</div>
        </div>
      </div>

      {/* Project Progress Bar */}
      <div className="mb-6">
        <ProgressBar
          completed={completedTasks.length}
          total={tasks.length}
          size="md"
        />
      </div>

      <div className={viewMode === "list" ? "grid grid-cols-2 gap-8" : ""}>
        {/* Tasks Section */}
        <div className={viewMode === "list" ? "space-y-4" : ""}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-slate-900">Tasks</h2>
              {/* View Toggle */}
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === "list"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  title="List view"
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === "kanban"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  title="Kanban view"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => setViewMode("calendar")}
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === "calendar"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  title="Calendar view"
                >
                  <Calendar size={16} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowTemplateManager(true)}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
                title="Task Templates"
              >
                <LayoutTemplate size={16} />
                Templates
              </button>
              <button
                onClick={() => setShowAddTask(true)}
                className="flex items-center gap-2 text-indigo-500 hover:text-indigo-600 text-sm font-medium transition-colors"
              >
                <Plus size={16} />
                Add Task
              </button>
            </div>
          </div>

          {/* Filter Bar - only show in list view */}
          {viewMode === "list" && (
            <FilterBar
              filters={filters}
              onFiltersChange={setFilters}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSortChange={(newSortBy, newDirection) => {
                setSortBy(newSortBy);
                setSortDirection(newDirection);
              }}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          )}

          {showAddTask && (
            <form
              onSubmit={handleAddTask}
              className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-sm"
            >
              {/* Title */}
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Task title..."
                autoFocus
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {/* Description */}
              <textarea
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Description (optional)..."
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
              />

              {/* Priority & Due Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Priority
                  </label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) =>
                      setNewTaskPriority(e.target.value as Priority)
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Milestone & Tags */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Milestone
                  </label>
                  <select
                    value={newTaskMilestoneId}
                    onChange={(e) => setNewTaskMilestoneId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">No milestone</option>
                    {state.milestones
                      .filter((m) => m.projectId === projectId)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Tags
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (
                        e.target.value &&
                        !newTaskTagIds.includes(e.target.value)
                      ) {
                        setNewTaskTagIds([...newTaskTagIds, e.target.value]);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Add tag...</option>
                    {state.tags
                      .filter((t) => !newTaskTagIds.includes(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Selected Tags */}
              {newTaskTagIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {newTaskTagIds.map((tagId) => {
                    const tag = state.tags.find((t) => t.id === tagId);
                    if (!tag) return null;
                    return (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${tag.color}20`,
                          color: tag.color,
                        }}
                      >
                        {tag.name}
                        <button
                          type="button"
                          onClick={() =>
                            setNewTaskTagIds(
                              newTaskTagIds.filter((id) => id !== tagId),
                            )
                          }
                          className="hover:opacity-70"
                        >
                          &times;
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Add Task
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTask(false);
                    setNewTaskTitle("");
                    setNewTaskDescription("");
                    setNewTaskPriority("medium");
                    setNewTaskDueDate("");
                    setNewTaskMilestoneId("");
                    setNewTaskTagIds([]);
                  }}
                  className="text-slate-500 hover:text-slate-700 px-4 py-2 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {viewMode === "list" ? (
            <>
              {activeTasks.length === 0 && !showAddTask ? (
                <div className="bg-white border border-slate-200 border-dashed rounded-xl p-8 text-center">
                  <CheckCircle2
                    className="mx-auto text-green-500 mb-3"
                    size={32}
                  />
                  <p className="text-sm text-slate-500">No active tasks</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={activeTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {activeTasks.map((task) => (
                        <SortableTaskItem
                          key={task.id}
                          task={task}
                          onComplete={handleCompleteTask}
                          onEdit={setEditingTask}
                          onStartFocus={onStartFocus}
                          onDelete={handleDeleteTask}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {completedTasks.length > 0 && (
                <div className="pt-4">
                  <h3 className="text-sm font-medium text-slate-400 mb-2">
                    Completed ({completedTasks.length})
                  </h3>
                  <div className="space-y-2">
                    {completedTasks.slice(0, 5).map((task) => (
                      <div
                        key={task.id}
                        className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3"
                      >
                        <CheckCircle2 size={16} className="text-green-500" />
                        <span className="text-slate-400 line-through">
                          {task.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : viewMode === "kanban" ? (
            <KanbanBoard
              projectId={projectId}
              onEditTask={setEditingTask}
              onStartFocus={onStartFocus}
            />
          ) : (
            <CalendarView projectId={projectId} onEditTask={setEditingTask} />
          )}
        </div>

        {/* Scratchpad & Milestones Section - only show in list view */}
        {viewMode === "list" && (
          <div className="space-y-6">
            {/* Milestones */}
            <MilestoneManager projectId={projectId} />

            {/* Project Notes */}
            <ProjectNotes projectId={projectId} />

            {/* Activity Log */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <ActivityLogPanel projectId={projectId} limit={10} />
            </div>
          </div>
        )}
      </div>

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}

      {showTemplateManager && (
        <TemplateManager
          projectId={projectId}
          onClose={() => setShowTemplateManager(false)}
        />
      )}
    </div>
  );
}
