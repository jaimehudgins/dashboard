"use client";

import React, { useState } from "react";
import { Trash2, Plus, Check, Circle, Pencil, X } from "lucide-react";
import { QuickTodoList as QuickTodoListType, QuickTodoItem } from "@/types";

interface QuickTodoListProps {
  list: QuickTodoListType;
  onUpdate: (list: QuickTodoListType) => void;
  onDelete: (id: string) => void;
}

export default function QuickTodoList({
  list,
  onUpdate,
  onDelete,
}: QuickTodoListProps) {
  const [newItemText, setNewItemText] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(list.title);

  const handleAddItem = () => {
    if (!newItemText.trim()) return;

    const newItem: QuickTodoItem = {
      id: `item-${Date.now()}`,
      text: newItemText.trim(),
      completed: false,
    };

    onUpdate({
      ...list,
      items: [...list.items, newItem],
    });
    setNewItemText("");
  };

  const handleToggleItem = (itemId: string) => {
    onUpdate({
      ...list,
      items: list.items.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      ),
    });
  };

  const handleDeleteItem = (itemId: string) => {
    onUpdate({
      ...list,
      items: list.items.filter((item) => item.id !== itemId),
    });
  };

  const handleSaveTitle = () => {
    if (editedTitle.trim() && editedTitle !== list.title) {
      onUpdate({
        ...list,
        title: editedTitle.trim(),
      });
    }
    setIsEditingTitle(false);
  };

  const completedCount = list.items.filter((item) => item.completed).length;

  return (
    <div className="group bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
        {isEditingTitle ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTitle();
                if (e.key === "Escape") {
                  setEditedTitle(list.title);
                  setIsEditingTitle(false);
                }
              }}
              className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <button
              onClick={() => {
                setEditedTitle(list.title);
                setIsEditingTitle(false);
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <h3 className="text-sm font-semibold text-slate-800">
              {list.title}
            </h3>
            <button
              onClick={() => setIsEditingTitle(true)}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-opacity"
            >
              <Pencil size={12} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {completedCount}/{list.items.length}
          </span>
          <button
            onClick={() => onDelete(list.id)}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
            title="Delete list"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-1 mb-3">
        {list.items.map((item) => (
          <div
            key={item.id}
            className="group/item flex items-center gap-2 py-1 px-1 rounded hover:bg-slate-50"
          >
            <button
              onClick={() => handleToggleItem(item.id)}
              className="flex-shrink-0"
            >
              {item.completed ? (
                <Check size={16} className="text-green-500" />
              ) : (
                <Circle size={16} className="text-slate-300 hover:text-slate-500" />
              )}
            </button>
            <span
              className={`flex-1 text-sm ${
                item.completed
                  ? "text-slate-400 line-through"
                  : "text-slate-700"
              }`}
            >
              {item.text}
            </span>
            <button
              onClick={() => handleDeleteItem(item.id)}
              className="opacity-0 group-hover/item:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        {list.items.length === 0 && (
          <p className="text-xs text-slate-400 italic py-2">No items yet</p>
        )}
      </div>

      {/* Add new item */}
      <div className="flex items-center gap-2">
        <Plus size={16} className="text-slate-400" />
        <input
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
          placeholder="Add item..."
          className="flex-1 text-sm text-slate-700 bg-transparent focus:outline-none placeholder:text-slate-400"
        />
        {newItemText.trim() && (
          <button
            onClick={handleAddItem}
            className="text-xs text-indigo-500 hover:text-indigo-600 font-medium"
          >
            Add
          </button>
        )}
      </div>
    </div>
  );
}
