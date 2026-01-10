"use client";

import React, { useState } from "react";
import { Plus, CheckCircle2, Circle, Trash2, GripVertical } from "lucide-react";
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
import { useApp } from "@/store/store";
import { Task, Priority } from "@/types";

interface SubtaskListProps {
  parentTaskId: string;
  projectId: string | null;
}

interface SortableSubtaskProps {
  subtask: Task;
  onToggle: () => void;
  onDelete: () => void;
}

function SortableSubtask({
  subtask,
  onToggle,
  onDelete,
}: SortableSubtaskProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subtask.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isCompleted = subtask.status === "completed";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 ${
        isDragging ? "opacity-50 bg-slate-100" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      <button
        onClick={onToggle}
        className={`flex-shrink-0 transition-colors ${
          isCompleted ? "text-green-500" : "text-slate-300 hover:text-green-500"
        }`}
        aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
      >
        {isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>
      <span
        className={`flex-1 text-sm ${
          isCompleted ? "text-slate-400 line-through" : "text-slate-700"
        }`}
      >
        {subtask.title}
      </span>
      <button
        onClick={onDelete}
        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
        aria-label="Delete subtask"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function SubtaskList({
  parentTaskId,
  projectId,
}: SubtaskListProps) {
  const { dispatch, getSubtasks } = useApp();
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const subtasks = getSubtasks(parentTaskId);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;

    const maxOrder = Math.max(...subtasks.map((t) => t.displayOrder ?? 0), 0);

    const newSubtask: Task = {
      id: `subtask-${Date.now()}`,
      title: newSubtaskTitle.trim(),
      priority: "medium" as Priority,
      status: "pending",
      projectId,
      parentTaskId,
      createdAt: new Date(),
      focusMinutes: 0,
      displayOrder: maxOrder + 1,
    };

    dispatch({ type: "ADD_TASK", payload: newSubtask });
    setNewSubtaskTitle("");
    setIsAdding(false);
  };

  const handleToggleSubtask = (subtask: Task) => {
    dispatch({
      type: "UPDATE_TASK",
      payload: {
        ...subtask,
        status: subtask.status === "completed" ? "pending" : "completed",
      },
    });
  };

  const handleDeleteSubtask = (subtaskId: string) => {
    dispatch({ type: "DELETE_TASK", payload: subtaskId });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = subtasks.findIndex((t) => t.id === active.id);
      const newIndex = subtasks.findIndex((t) => t.id === over.id);

      const reorderedSubtasks = arrayMove(subtasks, oldIndex, newIndex);
      const taskIds = reorderedSubtasks.map((t) => t.id);

      dispatch({
        type: "REORDER_TASKS",
        payload: { taskIds },
      });
    }
  };

  const completedCount = subtasks.filter(
    (t) => t.status === "completed",
  ).length;
  const totalCount = subtasks.length;
  const progressPercent =
    totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-600 flex items-center gap-2">
          Subtasks
          {totalCount > 0 && (
            <span className="text-xs text-slate-400">
              ({completedCount}/{totalCount})
            </span>
          )}
        </label>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Subtask list */}
      {subtasks.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={subtasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {subtasks.map((subtask) => (
                <SortableSubtask
                  key={subtask.id}
                  subtask={subtask}
                  onToggle={() => handleToggleSubtask(subtask)}
                  onDelete={() => handleDeleteSubtask(subtask.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add subtask form */}
      {isAdding ? (
        <form onSubmit={handleAddSubtask} className="flex items-center gap-2">
          <input
            type="text"
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
            placeholder="Subtask title..."
            autoFocus
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={!newSubtaskTitle.trim()}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAdding(false);
              setNewSubtaskTitle("");
            }}
            className="text-slate-500 hover:text-slate-700 px-2 py-2 text-sm"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-500 transition-colors"
        >
          <Plus size={16} />
          Add subtask
        </button>
      )}
    </div>
  );
}
