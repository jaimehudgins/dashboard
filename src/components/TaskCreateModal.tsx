"use client";

import React, { useState } from "react";
import { X, Plus, Clock, ExternalLink } from "lucide-react";
import { useApp } from "@/store/store";
import { Task, Priority, TaskStatus, Tag } from "@/types";
import TagBadge from "./TagBadge";
import RecurrenceSelector from "./RecurrenceSelector";
import type { RecurrenceRule, Reminder } from "@/types";
import { Bell, Flag } from "lucide-react";

const reminderOptions = [
  { label: "1 hour before", minutes: 60 },
  { label: "3 hours before", minutes: 180 },
  { label: "1 day before", minutes: 1440 },
  { label: "3 days before", minutes: 4320 },
  { label: "1 week before", minutes: 10080 },
];

interface TaskCreateModalProps {
  onClose: () => void;
  defaultProjectId?: string | null;
  defaultWorkAreaId?: string;
  defaultCategoryId?: string;
}

export default function TaskCreateModal({
  onClose,
  defaultProjectId,
  defaultWorkAreaId,
  defaultCategoryId,
}: TaskCreateModalProps) {
  const { state, dispatch } = useApp();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(
    defaultProjectId ?? null,
  );
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<TaskStatus>("pending");
  const [dueDate, setDueDate] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>(null);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<
    Date | undefined
  >();
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [milestoneId, setMilestoneId] = useState<string | undefined>();
  const [link, setLink] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(
    defaultCategoryId,
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState<
    number | undefined
  >();
  const [workAreaId, setWorkAreaId] = useState<string | undefined>(
    defaultWorkAreaId,
  );

  const isMiscTask = projectId === null;
  const activeProjects = state.projects.filter((p) => !p.archived);
  const projectMilestones = state.milestones.filter(
    (m) => m.projectId === projectId,
  );
  const miscCategories = state.miscCategories || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      status,
      projectId,
      dueDate: dueDate ? new Date(dueDate + "T12:00:00") : undefined,
      createdAt: new Date(),
      focusMinutes: 0,
      tagIds,
      reminders,
      recurrenceRule,
      recurrenceEndDate,
      milestoneId: isMiscTask ? undefined : milestoneId,
      categoryId: isMiscTask ? categoryId : undefined,
      link: link.trim() || undefined,
      estimatedMinutes,
      workAreaId,
    };

    dispatch({ type: "ADD_TASK", payload: newTask });
    onClose();
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
      color: "#4a7c59",
      createdAt: new Date(),
    };

    dispatch({ type: "ADD_TAG", payload: newTag });
    setTagIds([...tagIds, newTag.id]);
    setNewTagName("");
  };

  const addReminder = (minutesBefore: number) => {
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
          <h2 className="text-lg font-semibold text-slate-900">New Task</h2>
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
            <label className="block text-sm text-slate-600 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
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
              placeholder="Add details, notes, or context..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1 flex items-center gap-2">
              <ExternalLink size={14} className="text-indigo-500" />
              Link (optional)
            </label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Assignment: Project or Category */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Assign to
            </label>
            <select
              value={
                projectId
                  ? `project:${projectId}`
                  : categoryId
                    ? `misc:${categoryId}`
                    : "unassigned"
              }
              onChange={(e) => {
                const value = e.target.value;
                if (value === "unassigned") {
                  setProjectId(null);
                  setCategoryId(undefined);
                } else if (value.startsWith("project:")) {
                  setProjectId(value.replace("project:", ""));
                  setCategoryId(undefined);
                } else if (value.startsWith("misc:")) {
                  setProjectId(null);
                  setCategoryId(value.replace("misc:", ""));
                }
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="unassigned">Unassigned</option>
              {activeProjects.length > 0 && (
                <optgroup label="Projects">
                  {activeProjects.map((project) => (
                    <option key={project.id} value={`project:${project.id}`}>
                      {project.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {miscCategories.length > 0 && (
                <optgroup label="Misc Categories">
                  {miscCategories.map((category) => (
                    <option key={category.id} value={`misc:${category.id}`}>
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Milestone Selector */}
          {projectId && projectMilestones.length > 0 && (
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

          {/* Work Area Selector */}
          {state.workAreas.length > 0 && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Work Area
              </label>
              <select
                value={workAreaId || ""}
                onChange={(e) => setWorkAreaId(e.target.value || undefined)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">No work area</option>
                {state.workAreas.map((wa) => (
                  <option key={wa.id} value={wa.id}>
                    {wa.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
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

            <div>
              <label className="block text-sm text-slate-600 mb-1 flex items-center gap-1">
                <Clock size={14} />
                Estimated
              </label>
              <select
                value={estimatedMinutes || ""}
                onChange={(e) =>
                  setEstimatedMinutes(
                    e.target.value ? parseInt(e.target.value) : undefined,
                  )
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">No estimate</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
                <option value="180">3 hours</option>
                <option value="240">4 hours</option>
                <option value="480">Full day (8h)</option>
              </select>
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

          {/* Recurrence Section */}
          <RecurrenceSelector
            value={recurrenceRule}
            onChange={setRecurrenceRule}
            endDate={recurrenceEndDate}
            onEndDateChange={setRecurrenceEndDate}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
