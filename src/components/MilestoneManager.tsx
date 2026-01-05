"use client";

import React, { useState } from "react";
import { Flag, Plus, Trash2, Edit2, X, Check, Calendar } from "lucide-react";
import { format } from "date-fns";
import { useApp } from "@/store/store";
import { Milestone, MilestoneStatus } from "@/types";

interface MilestoneManagerProps {
  projectId: string;
}

export default function MilestoneManager({ projectId }: MilestoneManagerProps) {
  const { state, dispatch, getProjectMilestones } = useApp();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  const milestones = getProjectMilestones(projectId);

  // Count tasks per milestone
  const getTaskCount = (milestoneId: string) => {
    return state.tasks.filter((t) => t.milestoneId === milestoneId).length;
  };

  const getCompletedTaskCount = (milestoneId: string) => {
    return state.tasks.filter(
      (t) => t.milestoneId === milestoneId && t.status === "completed",
    ).length;
  };

  const handleAddMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const milestone: Milestone = {
      id: crypto.randomUUID(),
      projectId,
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      dueDate: newDueDate ? new Date(newDueDate) : undefined,
      status: "active",
      displayOrder: milestones.length,
      createdAt: new Date(),
    };

    dispatch({ type: "ADD_MILESTONE", payload: milestone });
    setNewName("");
    setNewDescription("");
    setNewDueDate("");
    setShowAddForm(false);
  };

  const handleEditMilestone = (milestone: Milestone) => {
    setEditingId(milestone.id);
    setEditName(milestone.name);
    setEditDescription(milestone.description || "");
    setEditDueDate(
      milestone.dueDate
        ? new Date(milestone.dueDate).toISOString().split("T")[0]
        : "",
    );
  };

  const handleSaveEdit = (milestoneId: string) => {
    if (!editName.trim()) return;

    const milestone = milestones.find((m) => m.id === milestoneId);
    if (!milestone) return;

    dispatch({
      type: "UPDATE_MILESTONE",
      payload: {
        ...milestone,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        dueDate: editDueDate ? new Date(editDueDate) : undefined,
      },
    });

    setEditingId(null);
  };

  const handleToggleStatus = (milestone: Milestone) => {
    dispatch({
      type: "UPDATE_MILESTONE",
      payload: {
        ...milestone,
        status: milestone.status === "active" ? "completed" : "active",
      },
    });
  };

  const handleDeleteMilestone = (milestoneId: string) => {
    if (confirm("Delete this milestone? Tasks will be unlinked.")) {
      dispatch({ type: "DELETE_MILESTONE", payload: milestoneId });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
          <Flag size={14} className="text-indigo-500" />
          Milestones
        </h3>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
          >
            <Plus size={12} />
            Add
          </button>
        )}
      </div>

      {/* Milestone List */}
      {milestones.length > 0 && (
        <div className="space-y-2">
          {milestones.map((milestone) => {
            const taskCount = getTaskCount(milestone.id);
            const completedCount = getCompletedTaskCount(milestone.id);
            const progress =
              taskCount > 0 ? (completedCount / taskCount) * 100 : 0;
            const isOverdue =
              milestone.dueDate && new Date(milestone.dueDate) < new Date();

            return (
              <div
                key={milestone.id}
                className={`bg-slate-50 border rounded-lg p-3 ${
                  milestone.status === "completed"
                    ? "border-green-200 bg-green-50"
                    : "border-slate-200"
                }`}
              >
                {editingId === milestone.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description (optional)"
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="bg-white border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(milestone.id)}
                        className="text-xs bg-indigo-500 text-white px-2 py-1 rounded hover:bg-indigo-600"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleStatus(milestone)}
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              milestone.status === "completed"
                                ? "bg-green-500 border-green-500"
                                : "border-slate-300 hover:border-green-500"
                            }`}
                          >
                            {milestone.status === "completed" && (
                              <Check size={10} className="text-white" />
                            )}
                          </button>
                          <span
                            className={`font-medium text-sm ${
                              milestone.status === "completed"
                                ? "text-green-700 line-through"
                                : "text-slate-900"
                            }`}
                          >
                            {milestone.name}
                          </span>
                        </div>
                        {milestone.description && (
                          <p className="text-xs text-slate-500 mt-1 ml-6">
                            {milestone.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 ml-6 text-xs text-slate-500">
                          {milestone.dueDate && (
                            <span
                              className={`flex items-center gap-1 ${
                                isOverdue && milestone.status !== "completed"
                                  ? "text-red-500"
                                  : ""
                              }`}
                            >
                              <Calendar size={10} />
                              {format(new Date(milestone.dueDate), "MMM d")}
                            </span>
                          )}
                          <span>
                            {completedCount}/{taskCount} tasks
                          </span>
                        </div>
                        {/* Progress bar */}
                        {taskCount > 0 && (
                          <div className="mt-2 ml-6 h-1 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                milestone.status === "completed"
                                  ? "bg-green-500"
                                  : "bg-indigo-500"
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditMilestone(milestone)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteMilestone(milestone.id)}
                          className="p-1 text-slate-400 hover:text-red-500 rounded"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddMilestone}
          className="space-y-2 bg-white border border-slate-200 rounded-lg p-3"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Milestone name"
            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!newName.trim()}
              className="text-xs bg-indigo-500 text-white px-3 py-1.5 rounded hover:bg-indigo-600 disabled:opacity-50"
            >
              Add Milestone
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setNewName("");
                setNewDescription("");
                setNewDueDate("");
              }}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {milestones.length === 0 && !showAddForm && (
        <p className="text-xs text-slate-400 text-center py-2">
          No milestones yet
        </p>
      )}
    </div>
  );
}
