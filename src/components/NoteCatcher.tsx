"use client";

import React, { useState } from "react";
import { Plus, StickyNote as StickyNoteIcon, ListTodo } from "lucide-react";
import { useApp } from "@/store/store";
import { StickyNote as StickyNoteType, QuickTodoList as QuickTodoListType, StickyNoteColor } from "@/types";
import StickyNote from "./StickyNote";
import QuickTodoList from "./QuickTodoList";

export default function NoteCatcher() {
  const { state, dispatch } = useApp();
  const [showAddMenu, setShowAddMenu] = useState(false);

  const stickyNotes = [...state.stickyNotes].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
  const todoLists = [...state.quickTodoLists].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );

  const handleAddStickyNote = () => {
    const colors: StickyNoteColor[] = ["yellow", "pink", "blue", "green", "purple"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newNote: StickyNoteType = {
      id: `sticky-${Date.now()}`,
      title: "",
      content: "",
      color: randomColor,
      displayOrder: stickyNotes.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    dispatch({ type: "ADD_STICKY_NOTE", payload: newNote });
    setShowAddMenu(false);
  };

  const handleAddTodoList = () => {
    const newList: QuickTodoListType = {
      id: `todolist-${Date.now()}`,
      title: "New List",
      items: [],
      displayOrder: todoLists.length,
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

  const isEmpty = stickyNotes.length === 0 && todoLists.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <StickyNoteIcon className="h-6 w-6" />
            Note Catcher
          </h1>
          <p className="mt-1 text-slate-500">
            Capture quick notes and simple to-do lists
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
            <div className="absolute right-0 top-12 bg-white border border-slate-200 rounded-lg shadow-lg py-2 w-48 z-10">
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

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <StickyNoteIcon className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-700 mb-2">
            No notes yet
          </h3>
          <p className="text-slate-500 mb-4 max-w-md">
            Click the Add button to create your first sticky note or todo list.
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

      {/* Content grid */}
      {!isEmpty && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Sticky Notes */}
          {stickyNotes.map((note) => (
            <StickyNote
              key={note.id}
              note={note}
              onUpdate={handleUpdateStickyNote}
              onDelete={handleDeleteStickyNote}
            />
          ))}

          {/* Todo Lists */}
          {todoLists.map((list) => (
            <QuickTodoList
              key={list.id}
              list={list}
              onUpdate={handleUpdateTodoList}
              onDelete={handleDeleteTodoList}
            />
          ))}
        </div>
      )}

      {/* Click outside to close menu */}
      {showAddMenu && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowAddMenu(false)}
        />
      )}
    </div>
  );
}
