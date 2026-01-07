"use client";

import React, { useState } from "react";
import { X, Plus, Bell, Clock, ExternalLink } from "lucide-react";
import { useApp } from "@/store/store";
import {
  Task,
  Priority,
  TaskStatus,
  Reminder,
  Tag,
  RecurrenceRule,
} from "@/types";
import TagBadge from "./TagBadge";
import SubtaskList from "./SubtaskList";
import DependencyPicker from "./DependencyPicker";
import RecurrenceSelector from "./RecurrenceSelector";
import CommentSection from "./CommentSection";
import { Flag } from "lucide-react";

interface TaskEditModalProps {
  task: Task;
  onClose: () => void;
}

const reminderOptions = [
  { label: "1 hour before", minutes: 60 },
  { label: "3 hours before", minutes: 180 },
  { label: "1 day before", minutes: 1440 },
  { label: "3 days before", minutes: 4320 },
  { label: "1 week before", minutes: 10080 },
];

export default function TaskEditModal({ task, onClose }: TaskEditModalProps) {
  const { state, dispatch } = useApp();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [projectId, setProjectId] = useState(task.projectId);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [dueDate, setDueDate] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "",
  );
  const [tagIds, setTagIds] = useState<string[]>(task.tagIds || []);
  const [reminders, setReminders] = useState<Reminder[]>(task.reminders || []);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>(
    task.recurrenceRule || null,
  );
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<Date | undefined>(
    task.recurrenceEndDate ? new Date(task.recurrenceEndDate) : undefined,
  );
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [milestoneId, setMilestoneId] = useState<string | undefined>(
    task.milestoneId,
  );
  const [link, setLink] = useState(task.link || "");

  // Filter to only show active (non-archived) projects
  const activeProjects = state.projects.filter((p) => !p.archived);

  // Get milestones for the current project
  const projectMilestones = state.milestones.filter(
    (m) => m.projectId === projectId,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    dispatch({
      type: "UPDATE_TASK",
      payload: {
        ...task,
        title: title.trim(),
        description: description.trim() || undefined,
        projectId,
        priority,
        status,
        dueDate: dueDate ? new Date(dueDate + "T12:00:00") : undefined,
        tagIds,
        reminders,
        recurrenceRule,
        recurrenceEndDate,
        milestoneId,
        link: link.trim() || undefined,
      },
    });

    onClose();
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this task?")) {
      dispatch({ type: "DELETE_TASK", payload: task.id });
      onClose();
    }
  };

  const toggleTag = (tagId: string) => {
    if (tagIds.includes(tagId)) {
      setTagIds(tagIds.filter((id) => id !== tagId));
    } else {
      setTagIds([...tagIds, tagId]);
    }
  };

  const createAndAddTag = () => {
    if (!newTagName.trim()) return;

    const newTag: Tag = {
      id: `tag-${Date.now()}`,
      name: newTagName.trim(),
      color: "#6366f1",
      createdAt: new Date(),
    };

    dispatch({ type: "ADD_TAG", payload: newTag });
    setTagIds([...tagIds, newTag.id]);
    setNewTagName("");
  };

  const addReminder = (minutesBefore: number) => {
    // Check if reminder already exists
    if (reminders.some((r) => r.minutesBefore === minutesBefore)) return;

    const newReminder: Reminder = {
      id: `reminder-${Date.now()}`,
      minutesBefore,
      notified: false,
    };

    setReminders([...reminders, newReminder]);
  };

  const removeReminder = (reminderId: string) => {
    setReminders(reminders.filter((r) => r.id !== reminderId));
  };

  const getReminderLabel = (minutesBefore: number): string => {
    const option = reminderOptions.find((o) => o.minutes === minutesBefore);
    return option?.label || `${minutesBefore} minutes before`;
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">Edit Task</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              rows={3}
              placeholder="Add details, notes, or context..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1 flex items-center gap-2">
              <ExternalLink size={14} className="text-indigo-500" />
              Link (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 rounded-lg transition-colors"
                  title="Open link"
                >
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
          </div>

          {/* Subtasks Section - only show for non-subtasks */}
          {!task.parentTaskId && (
            <SubtaskList parentTaskId={task.id} projectId={task.projectId} />
          )}

          {/* Dependencies Section - only show for non-subtasks */}
          {!task.parentTaskId && (
            <DependencyPicker taskId={task.id} projectId={task.projectId} />
          )}

          <div>
            <label className="block text-sm text-slate-600 mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Milestone Selector - only show for non-subtasks and if milestones exist */}
          {!task.parentTaskId && projectMilestones.length > 0 && (
            <div>
              <label className="block text-sm text-slate-600 mb-1 flex items-center gap-2">
                <Flag size={14} className="text-indigo-500" />
                Milestone
              </label>
              <select
                value={milestoneId || ""}
                onChange={(e) => setMilestoneId(e.target.value || undefined)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">No milestone</option>
                {projectMilestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Tags Section */}
          <div>
            <label className="block text-sm text-slate-600 mb-2">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tagIds.map((tagId) => {
                const tag = state.tags.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                  <TagBadge
                    key={tag.id}
                    tag={tag}
                    onRemove={() => toggleTag(tag.id)}
                  />
                );
              })}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTagDropdown(!showTagDropdown)}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-500 transition-colors"
              >
                <Plus size={16} />
                Add tag
              </button>
              {showTagDropdown && (
                <div className="absolute top-8 left-0 bg-white border border-slate-200 rounded-lg shadow-lg z-10 w-64">
                  <div className="p-2 border-b border-slate-100">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Create new tag..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            createAndAddTag();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={createAndAddTag}
                        disabled={!newTagName.trim()}
                        className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-2 py-1 rounded text-sm"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-2">
                    {state.tags.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-2">
                        No tags yet
                      </p>
                    ) : (
                      state.tags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${
                            tagIds.includes(tag.id)
                              ? "bg-indigo-50 text-indigo-600"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="p-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowTagDropdown(false)}
                      className="w-full text-sm text-slate-500 hover:text-slate-700"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Reminders Section */}
          {dueDate && (
            <div>
              <label className="block text-sm text-slate-600 mb-2 flex items-center gap-2">
                <Bell size={14} />
                Reminders
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {reminders.map((reminder) => (
                  <span
                    key={reminder.id}
                    className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs px-2 py-1 rounded-full"
                  >
                    <Clock size={12} />
                    {getReminderLabel(reminder.minutesBefore)}
                    <button
                      type="button"
                      onClick={() => removeReminder(reminder.id)}
                      className="hover:text-amber-900"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {reminderOptions
                  .filter(
                    (opt) =>
                      !reminders.some((r) => r.minutesBefore === opt.minutes),
                  )
                  .map((opt) => (
                    <button
                      key={opt.minutes}
                      type="button"
                      onClick={() => addReminder(opt.minutes)}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded transition-colors"
                    >
                      + {opt.label}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Recurrence Section - only show for non-subtasks */}
          {!task.parentTaskId && (
            <RecurrenceSelector
              value={recurrenceRule}
              onChange={setRecurrenceRule}
              endDate={recurrenceEndDate}
              onEndDateChange={setRecurrenceEndDate}
            />
          )}

          {/* Comments Section */}
          <CommentSection taskId={task.id} />

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleDelete}
              className="text-red-500 hover:text-red-600 text-sm font-medium transition-colors"
            >
              Delete Task
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
