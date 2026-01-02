"use client";

import React, { useState } from "react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
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
  Clock,
  Flame,
  AlertCircle,
  Pencil,
  Play,
  ListChecks,
  Link2,
  Repeat,
} from "lucide-react";
import { format } from "date-fns";
import { useApp } from "@/store/store";
import { Task, TaskStatus, Priority } from "@/types";
import TagBadge from "./TagBadge";

interface KanbanBoardProps {
  projectId: string;
  onEditTask: (task: Task) => void;
  onStartFocus: (task: Task) => void;
}

const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: "pending", title: "To Do", color: "bg-slate-100" },
  { id: "in_progress", title: "In Progress", color: "bg-blue-100" },
  { id: "blocked", title: "Blocked", color: "bg-amber-100" },
  { id: "completed", title: "Done", color: "bg-green-100" },
];

const priorityConfig: Record<Priority, { color: string; bg: string }> = {
  critical: { color: "text-red-600", bg: "bg-red-50" },
  high: { color: "text-orange-600", bg: "bg-orange-50" },
  medium: { color: "text-yellow-600", bg: "bg-yellow-50" },
  low: { color: "text-slate-500", bg: "bg-slate-100" },
};

interface KanbanCardProps {
  task: Task;
  onEdit: () => void;
  onStartFocus: () => void;
}

function KanbanCard({ task, onEdit, onStartFocus }: KanbanCardProps) {
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
  const subtasks = getSubtasks(task.id);
  const completedSubtasks = subtasks.filter((s) => s.status === "completed");
  const hasSubtasks = subtasks.length > 0;
  const isBlocked = isTaskBlocked(task.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-white border border-slate-200 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing group hover:border-slate-300 transition-all ${
        isDragging ? "opacity-50 shadow-lg" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-slate-900 line-clamp-2">{task.title}</p>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartFocus();
            }}
            className="p-1 text-indigo-500 hover:bg-indigo-50 rounded transition-colors"
          >
            <Play size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center flex-wrap gap-1.5 text-xs">
        <span className={`px-1.5 py-0.5 rounded ${priority.bg} ${priority.color}`}>
          {task.priority}
        </span>
        {isBlocked && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
            <Link2 size={10} />
            Blocked
          </span>
        )}
        {task.dueDate && (
          <span className={`flex items-center gap-1 ${isOverdue ? "text-red-500" : "text-slate-500"}`}>
            {isOverdue ? <AlertCircle size={10} /> : <Clock size={10} />}
            {format(new Date(task.dueDate), "MMM d")}
          </span>
        )}
        {task.focusMinutes > 0 && (
          <span className="flex items-center gap-1 text-slate-500">
            <Flame size={10} className="text-orange-500" />
            {task.focusMinutes}m
          </span>
        )}
        {hasSubtasks && (
          <span className="flex items-center gap-1 text-slate-500">
            <ListChecks size={10} className="text-indigo-500" />
            {completedSubtasks.length}/{subtasks.length}
          </span>
        )}
        {task.recurrenceRule && (
          <span className="flex items-center gap-1 text-slate-500">
            <Repeat size={10} className="text-purple-500" />
          </span>
        )}
      </div>
      {task.tagIds && task.tagIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tagIds.slice(0, 2).map((tagId) => {
            const tag = state.tags.find((t) => t.id === tagId);
            if (!tag) return null;
            return <TagBadge key={tag.id} tag={tag} size="sm" />;
          })}
          {task.tagIds.length > 2 && (
            <span className="text-xs text-slate-400">+{task.tagIds.length - 2}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface KanbanColumnProps {
  column: { id: TaskStatus; title: string; color: string };
  tasks: Task[];
  onEditTask: (task: Task) => void;
  onStartFocus: (task: Task) => void;
}

function KanbanColumn({ column, tasks, onEditTask, onStartFocus }: KanbanColumnProps) {
  return (
    <div className="flex-1 min-w-[250px] max-w-[320px]">
      <div className={`rounded-t-lg px-3 py-2 ${column.color}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-slate-700">{column.title}</h3>
          <span className="text-xs text-slate-500 bg-white/50 px-2 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
      </div>
      <div className="bg-slate-50 rounded-b-lg p-2 min-h-[200px]">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tasks.map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                onEdit={() => onEditTask(task)}
                onStartFocus={() => onStartFocus(task)}
              />
            ))}
          </div>
        </SortableContext>
        {tasks.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({ projectId, onEditTask, onStartFocus }: KanbanBoardProps) {
  const { state, dispatch } = useApp();
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get tasks for this project, excluding subtasks
  const projectTasks = state.tasks.filter(
    (t) => t.projectId === projectId && !t.parentTaskId
  );

  // Group tasks by status
  const tasksByStatus: Record<TaskStatus, Task[]> = {
    pending: [],
    in_progress: [],
    blocked: [],
    completed: [],
  };

  projectTasks.forEach((task) => {
    if (tasksByStatus[task.status]) {
      tasksByStatus[task.status].push(task);
    }
  });

  // Sort each column by displayOrder
  Object.keys(tasksByStatus).forEach((status) => {
    tasksByStatus[status as TaskStatus].sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
    );
  });

  const handleDragStart = (event: DragStartEvent) => {
    const task = projectTasks.find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeTask = projectTasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    // Check if dropping over a column or a task
    const overId = over.id as string;
    let newStatus: TaskStatus | null = null;

    // Check if it's a column
    const column = columns.find((c) => c.id === overId);
    if (column) {
      newStatus = column.id;
    } else {
      // It's a task, find its status
      const overTask = projectTasks.find((t) => t.id === overId);
      if (overTask) {
        newStatus = overTask.status;
      }
    }

    if (newStatus && newStatus !== activeTask.status) {
      dispatch({
        type: "UPDATE_TASK",
        payload: { ...activeTask, status: newStatus },
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;
    if (active.id === over.id) return;

    const activeTask = projectTasks.find((t) => t.id === active.id);
    const overTask = projectTasks.find((t) => t.id === over.id);

    if (!activeTask) return;

    // Reorder within the same column
    if (overTask && activeTask.status === overTask.status) {
      const columnTasks = tasksByStatus[activeTask.status];
      const oldIndex = columnTasks.findIndex((t) => t.id === active.id);
      const newIndex = columnTasks.findIndex((t) => t.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedTasks = arrayMove(columnTasks, oldIndex, newIndex);
        const taskIds = reorderedTasks.map((t) => t.id);
        dispatch({
          type: "REORDER_TASKS",
          payload: { taskIds },
        });
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={tasksByStatus[column.id]}
            onEditTask={onEditTask}
            onStartFocus={onStartFocus}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="bg-white border border-slate-300 rounded-lg p-3 shadow-xl opacity-90">
            <p className="text-sm font-medium text-slate-900">{activeTask.title}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
