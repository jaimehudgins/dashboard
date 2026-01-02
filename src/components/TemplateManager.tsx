"use client";

import React, { useState } from "react";
import {
  X,
  Plus,
  LayoutTemplate,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useApp } from "@/store/store";
import { TaskTemplate, Priority, Task } from "@/types";

interface TemplateManagerProps {
  projectId: string;
  onClose: () => void;
}

const priorityOptions: { value: Priority; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export default function TemplateManager({
  projectId,
  onClose,
}: TemplateManagerProps) {
  const { state, dispatch } = useApp();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  // Create template form state
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [newTemplatePriority, setNewTemplatePriority] =
    useState<Priority>("medium");
  const [newTemplateSubtasks, setNewTemplateSubtasks] = useState<
    { title: string; priority: Priority }[]
  >([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;

    const newTemplate: TaskTemplate = {
      id: `template-${Date.now()}`,
      name: newTemplateName.trim(),
      description: newTemplateDescription.trim() || undefined,
      defaultPriority: newTemplatePriority,
      subtasks: newTemplateSubtasks,
      createdAt: new Date(),
    };

    dispatch({ type: "ADD_TEMPLATE", payload: newTemplate });

    // Reset form
    setNewTemplateName("");
    setNewTemplateDescription("");
    setNewTemplatePriority("medium");
    setNewTemplateSubtasks([]);
    setShowCreateForm(false);
  };

  const handleAddSubtaskToTemplate = () => {
    if (!newSubtaskTitle.trim()) return;
    setNewTemplateSubtasks([
      ...newTemplateSubtasks,
      { title: newSubtaskTitle.trim(), priority: "medium" },
    ]);
    setNewSubtaskTitle("");
  };

  const handleRemoveSubtaskFromTemplate = (index: number) => {
    setNewTemplateSubtasks(newTemplateSubtasks.filter((_, i) => i !== index));
  };

  const handleDeleteTemplate = (templateId: string) => {
    if (confirm("Are you sure you want to delete this template?")) {
      dispatch({ type: "DELETE_TEMPLATE", payload: templateId });
    }
  };

  const handleCreateFromTemplate = (template: TaskTemplate) => {
    // Create the main task
    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: template.name,
      description: template.description,
      priority: template.defaultPriority,
      status: "pending",
      projectId,
      createdAt: new Date(),
      focusMinutes: 0,
      displayOrder: state.tasks.filter((t) => t.projectId === projectId).length,
    };

    dispatch({ type: "ADD_TASK", payload: newTask });

    // Create subtasks
    template.subtasks.forEach((subtask, index) => {
      const newSubtask: Task = {
        id: `subtask-${Date.now()}-${index}`,
        title: subtask.title,
        priority: subtask.priority,
        status: "pending",
        projectId,
        parentTaskId: newTask.id,
        createdAt: new Date(),
        focusMinutes: 0,
        displayOrder: index,
      };
      dispatch({ type: "ADD_TASK", payload: newSubtask });
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <LayoutTemplate size={20} />
            Task Templates
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Template List */}
        <div className="space-y-3 mb-6">
          {state.taskTemplates.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <LayoutTemplate size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No templates yet</p>
              <p className="text-xs">
                Create a template to quickly add common tasks
              </p>
            </div>
          ) : (
            state.taskTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden"
              >
                <div className="flex items-center justify-between p-3">
                  <button
                    onClick={() =>
                      setExpandedTemplate(
                        expandedTemplate === template.id ? null : template.id,
                      )
                    }
                    className="flex items-center gap-2 text-left flex-1"
                  >
                    {expandedTemplate === template.id ? (
                      <ChevronUp size={16} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-400" />
                    )}
                    <span className="font-medium text-slate-900">
                      {template.name}
                    </span>
                    {template.subtasks.length > 0 && (
                      <span className="text-xs text-slate-400">
                        ({template.subtasks.length} subtasks)
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCreateFromTemplate(template)}
                      className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Create task from template"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete template"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {expandedTemplate === template.id && (
                  <div className="px-3 pb-3 pt-0 border-t border-slate-200">
                    {template.description && (
                      <p className="text-sm text-slate-500 mt-2">
                        {template.description}
                      </p>
                    )}
                    <div className="mt-2 text-xs text-slate-400">
                      Default priority: {template.defaultPriority}
                    </div>
                    {template.subtasks.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-slate-500 mb-1">Subtasks:</p>
                        <ul className="text-sm text-slate-600 space-y-1">
                          {template.subtasks.map((subtask, index) => (
                            <li key={index} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                              {subtask.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Create Template Form */}
        {showCreateForm ? (
          <form
            onSubmit={handleCreateTemplate}
            className="space-y-4 border-t border-slate-200 pt-4"
          >
            <h3 className="font-medium text-slate-900">Create New Template</h3>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Template Name
              </label>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g., Bug Fix, Feature Request..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Description (optional)
              </label>
              <textarea
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
                rows={2}
                placeholder="Template description..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Default Priority
              </label>
              <select
                value={newTemplatePriority}
                onChange={(e) =>
                  setNewTemplatePriority(e.target.value as Priority)
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {priorityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Subtasks
              </label>
              <div className="space-y-2">
                {newTemplateSubtasks.map((subtask, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2"
                  >
                    <span className="flex-1 text-sm text-slate-700">
                      {subtask.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubtaskFromTemplate(index)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Add subtask..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSubtaskToTemplate();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddSubtaskToTemplate}
                    disabled={!newSubtaskTitle.trim()}
                    className="bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 px-3 py-2 rounded-lg text-sm transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewTemplateName("");
                  setNewTemplateDescription("");
                  setNewTemplatePriority("medium");
                  setNewTemplateSubtasks([]);
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newTemplateName.trim()}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
              >
                Create Template
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
          >
            <Plus size={16} />
            Create New Template
          </button>
        )}
      </div>
    </div>
  );
}
