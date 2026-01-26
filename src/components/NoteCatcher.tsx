"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plus, StickyNote as StickyNoteIcon, ListTodo } from "lucide-react";
import { useApp } from "@/store/store";
import {
  StickyNote as StickyNoteType,
  QuickTodoList as QuickTodoListType,
  StickyNoteColor,
} from "@/types";
import StickyNote from "./StickyNote";
import QuickTodoList from "./QuickTodoList";

interface DraggableItem {
  id: string;
  type: "sticky" | "todo";
  data: StickyNoteType | QuickTodoListType;
}

export default function NoteCatcher() {
  const { state, dispatch } = useApp();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Combine sticky notes and todo lists into draggable items
  const items: DraggableItem[] = [
    ...state.stickyNotes.map((note) => ({
      id: note.id,
      type: "sticky" as const,
      data: note,
    })),
    ...state.quickTodoLists.map((list) => ({
      id: list.id,
      type: "todo" as const,
      data: list,
    })),
  ];

  const handleAddStickyNote = () => {
    const colors: StickyNoteColor[] = [
      "yellow",
      "pink",
      "blue",
      "green",
      "purple",
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    // Place new notes in a default position (top-left area with some offset based on count)
    const offset = state.stickyNotes.length * 20;

    const newNote: StickyNoteType = {
      id: `sticky-${Date.now()}`,
      title: "",
      content: "",
      color: randomColor,
      displayOrder: state.stickyNotes.length,
      positionX: 20 + (offset % 200),
      positionY: 20 + (offset % 150),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    dispatch({ type: "ADD_STICKY_NOTE", payload: newNote });
    setShowAddMenu(false);
  };

  const handleAddTodoList = () => {
    const offset = state.quickTodoLists.length * 20;

    const newList: QuickTodoListType = {
      id: `todolist-${Date.now()}`,
      title: "New List",
      items: [],
      displayOrder: state.quickTodoLists.length,
      positionX: 300 + (offset % 200),
      positionY: 20 + (offset % 150),
      createdAt: new Date(),
    };

    dispatch({ type: "ADD_QUICK_TODO_LIST", payload: newList });
    setShowAddMenu(false);
  };

  const handleUpdateStickyNote = (note: StickyNoteType) => {
    dispatch({ type: "UPDATE_STICKY_NOTE", payload: note });
  };

  const handleDeleteStickyNote = (id: string) => {
    dispatch({ type: "DELETE_STICKY_NOTE", payload: id });
  };

  const handleUpdateTodoList = (list: QuickTodoListType) => {
    dispatch({ type: "UPDATE_QUICK_TODO_LIST", payload: list });
  };

  const handleDeleteTodoList = (id: string) => {
    dispatch({ type: "DELETE_QUICK_TODO_LIST", payload: id });
  };

  const handleMouseDown = (e: React.MouseEvent, item: DraggableItem) => {
    // Don't start drag if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "BUTTON" ||
      target.tagName === "SELECT" ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea")
    ) {
      return;
    }

    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setDragging(item.id);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - canvasRect.left - dragOffset.x;
    const y = e.clientY - canvasRect.top - dragOffset.y;

    // Constrain to canvas bounds
    const constrainedX = Math.max(0, Math.min(x, canvasRect.width - 250));
    const constrainedY = Math.max(0, Math.min(y, canvasRect.height - 180));

    const item = items.find((i) => i.id === dragging);
    if (!item) return;

    if (item.type === "sticky") {
      const note = item.data as StickyNoteType;
      handleUpdateStickyNote({
        ...note,
        positionX: constrainedX,
        positionY: constrainedY,
      });
    } else {
      const list = item.data as QuickTodoListType;
      handleUpdateTodoList({
        ...list,
        positionX: constrainedX,
        positionY: constrainedY,
      });
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setDragging(null);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const isEmpty =
    state.stickyNotes.length === 0 && state.quickTodoLists.length === 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <StickyNoteIcon className="h-6 w-6" />
            Note Catcher
          </h1>
          <p className="mt-1 text-slate-500">
            Drag notes anywhere on the canvas to organize your thoughts
          </p>
        </div>

        {/* Add button */}
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>

          {showAddMenu && (
            <div className="absolute right-0 top-12 bg-white border border-slate-200 rounded-lg shadow-lg py-2 w-48 z-20">
              <button
                onClick={handleAddStickyNote}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <StickyNoteIcon size={16} className="text-amber-500" />
                Sticky Note
              </button>
              <button
                onClick={handleAddTodoList}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <ListTodo size={16} className="text-indigo-500" />
                Todo List
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={canvasRef}
        className="flex-1 relative rounded-xl border-2 border-dashed border-slate-200 min-h-[600px] overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: dragging ? "grabbing" : "default" }}
      >
        {/* Invisible grid lines (very subtle) */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Vertical divider */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-100" />
          {/* Horizontal dividers */}
          <div className="absolute left-0 right-0 top-1/3 h-px bg-slate-100" />
          <div className="absolute left-0 right-0 top-2/3 h-px bg-slate-100" />
        </div>

        {/* Empty state */}
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <StickyNoteIcon className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-700 mb-2">
              No notes yet
            </h3>
            <p className="text-slate-500 mb-4 max-w-md">
              Click the Add button to create sticky notes or todo lists, then
              drag them anywhere on the canvas.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleAddStickyNote}
                className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors"
              >
                <StickyNoteIcon size={16} />
                Add Sticky Note
              </button>
              <button
                onClick={handleAddTodoList}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-800 rounded-lg hover:bg-indigo-200 transition-colors"
              >
                <ListTodo size={16} />
                Add Todo List
              </button>
            </div>
          </div>
        )}

        {/* Draggable items */}
        {state.stickyNotes.map((note) => (
          <div
            key={note.id}
            className="absolute"
            style={{
              left: note.positionX ?? 20,
              top: note.positionY ?? 20,
              width: 250,
              cursor: dragging === note.id ? "grabbing" : "grab",
              zIndex: dragging === note.id ? 100 : 1,
            }}
            onMouseDown={(e) =>
              handleMouseDown(e, { id: note.id, type: "sticky", data: note })
            }
          >
            <StickyNote
              note={note}
              onUpdate={handleUpdateStickyNote}
              onDelete={handleDeleteStickyNote}
            />
          </div>
        ))}

        {state.quickTodoLists.map((list) => (
          <div
            key={list.id}
            className="absolute"
            style={{
              left: list.positionX ?? 300,
              top: list.positionY ?? 20,
              width: 280,
              cursor: dragging === list.id ? "grabbing" : "grab",
              zIndex: dragging === list.id ? 100 : 1,
            }}
            onMouseDown={(e) =>
              handleMouseDown(e, { id: list.id, type: "todo", data: list })
            }
          >
            <QuickTodoList
              list={list}
              onUpdate={handleUpdateTodoList}
              onDelete={handleDeleteTodoList}
            />
          </div>
        ))}
      </div>

      {/* Click outside to close menu */}
      {showAddMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowAddMenu(false)}
        />
      )}
    </div>
  );
}
