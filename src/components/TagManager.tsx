"use client";

import React, { useState } from "react";
import { X, Plus, Pencil, Trash2 } from "lucide-react";
import { useApp } from "@/store/store";
import { Tag } from "@/types";

interface TagManagerProps {
  onClose: () => void;
}

const colorOptions = [
  "#6366f1", // Indigo
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#14b8a6", // Teal
  "#0ea5e9", // Sky
  "#6b7280", // Gray
];

export default function TagManager({ onClose }: TagManagerProps) {
  const { state, dispatch } = useApp();
  const [isAdding, setIsAdding] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(colorOptions[0]);

  const handleCreate = () => {
    if (!name.trim()) return;

    dispatch({
      type: "ADD_TAG",
      payload: {
        id: `tag-${Date.now()}`,
        name: name.trim(),
        color,
        createdAt: new Date(),
      },
    });

    setName("");
    setColor(colorOptions[0]);
    setIsAdding(false);
  };

  const handleUpdate = () => {
    if (!editingTag || !name.trim()) return;

    dispatch({
      type: "UPDATE_TAG",
      payload: {
        ...editingTag,
        name: name.trim(),
        color,
      },
    });

    setName("");
    setColor(colorOptions[0]);
    setEditingTag(null);
  };

  const handleDelete = (tagId: string) => {
    if (confirm("Delete this tag? It will be removed from all tasks.")) {
      dispatch({ type: "DELETE_TAG", payload: tagId });
    }
  };

  const startEditing = (tag: Tag) => {
    setEditingTag(tag);
    setName(tag.name);
    setColor(tag.color);
    setIsAdding(false);
  };

  const startAdding = () => {
    setIsAdding(true);
    setEditingTag(null);
    setName("");
    setColor(colorOptions[0]);
  };

  const cancelForm = () => {
    setIsAdding(false);
    setEditingTag(null);
    setName("");
    setColor(colorOptions[0]);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">Manage Tags</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tag List */}
        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {state.tags.length === 0 && !isAdding && (
            <p className="text-slate-500 text-sm text-center py-4">
              No tags yet. Create one to get started.
            </p>
          )}
          {state.tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-lg group"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-slate-900 font-medium">{tag.name}</span>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEditing(tag)}
                  className="text-slate-400 hover:text-indigo-500 transition-colors"
                  aria-label={`Edit ${tag.name}`}
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(tag.id)}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                  aria-label={`Delete ${tag.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add/Edit Form */}
        {(isAdding || editingTag) && (
          <div className="border-t border-slate-200 pt-4 space-y-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Tag Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Urgent, Bug, Feature"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full transition-all ${
                      color === c
                        ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-white"
                        : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={cancelForm}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={editingTag ? handleUpdate : handleCreate}
                disabled={!name.trim()}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium transition-colors"
              >
                {editingTag ? "Update" : "Create"}
              </button>
            </div>
          </div>
        )}

        {/* Add Button */}
        {!isAdding && !editingTag && (
          <button
            onClick={startAdding}
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 hover:text-indigo-500 hover:border-indigo-300 transition-colors"
          >
            <Plus size={18} />
            Add New Tag
          </button>
        )}
      </div>
    </div>
  );
}
