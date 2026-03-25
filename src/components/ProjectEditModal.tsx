"use client";

import React, { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { useApp } from "@/store/store";
import { Project, ProjectCategory } from "@/types";

interface ProjectEditModalProps {
  project: Project;
  onClose: () => void;
}

const colorOptions = [
  { value: "#4a7c59", label: "Forest" },
  { value: "#7a9b6d", label: "Sage" },
  { value: "#5a7247", label: "Moss" },
  { value: "#6b8f5e", label: "Fern" },
  { value: "#6b96b0", label: "Sky" },
  { value: "#b07d62", label: "Clay" },
  { value: "#c4a882", label: "Sand" },
  { value: "#8b8578", label: "Stone" },
  { value: "#7a8a6b", label: "Olive" },
  { value: "#6a8490", label: "Slate" },
];

export default function ProjectEditModal({
  project,
  onClose,
}: ProjectEditModalProps) {
  const { dispatch } = useApp();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [color, setColor] = useState(project.color);
  const [category, setCategory] = useState<ProjectCategory>(
    project.category || "work",
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    dispatch({
      type: "UPDATE_PROJECT",
      payload: {
        ...project,
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        category,
      },
    });

    onClose();
  };

  const handleArchive = () => {
    dispatch({
      type: "UPDATE_PROJECT",
      payload: {
        ...project,
        archived: true,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">Edit Project</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {showDeleteConfirm ? (
          <div className="space-y-4">
            <p className="text-slate-700">
              Are you sure you want to archive <strong>{project.name}</strong>?
              This will hide the project from the sidebar.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchive}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-lg font-medium transition-colors"
              >
                Archive Project
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Website Redesign"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Brief description of the project..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setColor(option.value)}
                    className={`w-8 h-8 rounded-full transition-all ${
                      color === option.value
                        ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-white"
                        : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: option.value }}
                    aria-label={`Select ${option.label} color`}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-2">
                Category
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCategory("work")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    category === "work"
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Work
                </button>
                <button
                  type="button"
                  onClick={() => setCategory("personal")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    category === "personal"
                      ? "bg-purple-500 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Personal
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 mt-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 text-red-500 hover:text-red-600 text-sm font-medium transition-colors"
                >
                  <Trash2 size={16} />
                  Archive Project
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!name.trim()}
                    className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
