"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Pause,
  Play,
  Square,
  Clock,
  FileText,
  ListTodo,
  Link2,
  StickyNote,
  Plus,
  Check,
  Circle,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Pencil,
  Focus,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task, ProjectNote, ProjectLink } from "@/types";

type PanelTab = "session" | "notes" | "tasks" | "links";

interface ZenModeProps {
  task: Task;
  onClose: () => void;
  onSwitchTask: (task: Task) => void;
}

export default function ZenMode({ task, onClose, onSwitchTask }: ZenModeProps) {
  const { state, dispatch, getProjectNotes, getProjectLinks } = useApp();
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [scratchpad, setScratchpad] = useState("");
  const [activeTab, setActiveTab] = useState<PanelTab>("session");

  // Note editing
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteTitle, setEditNoteTitle] = useState("");
  const [editNoteContent, setEditNoteContent] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");

  // Link editing
  const [addingLink, setAddingLink] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;
  const scratchpadRef = useRef(scratchpad);
  scratchpadRef.current = scratchpad;

  const project = state.projects.find((p) => p.id === task.projectId);
  const projectTasks = state.tasks.filter(
    (t) => t.projectId === task.projectId && t.status !== "completed",
  );
  const projectNotes = task.projectId ? getProjectNotes(task.projectId) : [];
  const projectLinks = task.projectId ? getProjectLinks(task.projectId) : [];

  useEffect(() => {
    dispatch({
      type: "START_FOCUS",
      payload: {
        id: `session-${Date.now()}`,
        taskId: task.id,
        projectId: task.projectId,
        startTime: new Date(),
        minutes: 0,
      },
    });
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const endCurrentSession = useCallback(() => {
    const minutes = Math.ceil(secondsRef.current / 60);
    dispatch({
      type: "END_FOCUS",
      payload: { minutes, notes: scratchpadRef.current || undefined },
    });
  }, [dispatch]);

  const handleEndSession = useCallback(() => {
    endCurrentSession();
    onClose();
  }, [endCurrentSession, onClose]);

  const handleComplete = useCallback(() => {
    endCurrentSession();
    dispatch({
      type: "UPDATE_TASK",
      payload: { ...task, status: "completed" },
    });
    onClose();
  }, [endCurrentSession, task, dispatch, onClose]);

  const handleSwitchTask = useCallback(
    (newTask: Task) => {
      if (newTask.id === task.id) return;
      endCurrentSession();
      setSeconds(0);
      setScratchpad("");
      setIsRunning(true);
      onSwitchTask(newTask);
    },
    [task.id, endCurrentSession, onSwitchTask],
  );

  const handleToggleTask = useCallback(
    (t: Task) => {
      dispatch({
        type: "UPDATE_TASK",
        payload: {
          ...t,
          status: t.status === "completed" ? "pending" : "completed",
        },
      });
    },
    [dispatch],
  );

  // Note handlers
  const handleAddNote = useCallback(() => {
    if (!newNoteTitle.trim() || !task.projectId) return;
    dispatch({
      type: "ADD_NOTE",
      payload: {
        id: `note-${Date.now()}`,
        projectId: task.projectId,
        title: newNoteTitle.trim(),
        content: newNoteContent.trim(),
        isPinned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    setNewNoteTitle("");
    setNewNoteContent("");
    setAddingNote(false);
  }, [newNoteTitle, newNoteContent, task.projectId, dispatch]);

  const handleSaveNote = useCallback(
    (note: ProjectNote) => {
      dispatch({
        type: "UPDATE_NOTE",
        payload: {
          ...note,
          title: editNoteTitle.trim(),
          content: editNoteContent.trim(),
          updatedAt: new Date(),
        },
      });
      setEditingNoteId(null);
    },
    [editNoteTitle, editNoteContent, dispatch],
  );

  const handleDeleteNote = useCallback(
    (id: string) => {
      dispatch({ type: "DELETE_NOTE", payload: id });
    },
    [dispatch],
  );

  // Link handlers
  const handleAddLink = useCallback(() => {
    if (!newLinkTitle.trim() || !newLinkUrl.trim() || !task.projectId) return;
    dispatch({
      type: "ADD_LINK",
      payload: {
        id: `link-${Date.now()}`,
        projectId: task.projectId,
        title: newLinkTitle.trim(),
        url: newLinkUrl.trim(),
        createdAt: new Date(),
      },
    });
    setNewLinkTitle("");
    setNewLinkUrl("");
    setAddingLink(false);
  }, [newLinkTitle, newLinkUrl, task.projectId, dispatch]);

  const handleDeleteLink = useCallback(
    (id: string) => {
      dispatch({ type: "DELETE_LINK", payload: id });
    },
    [dispatch],
  );

  const priorityColor: Record<string, string> = {
    critical: "text-red-400",
    high: "text-orange-400",
    medium: "text-yellow-400",
    low: "text-slate-400",
  };

  const tabs: { key: PanelTab; label: string; icon: React.ReactNode }[] = [
    { key: "session", label: "Session", icon: <FileText size={14} /> },
    { key: "notes", label: "Notes", icon: <StickyNote size={14} /> },
    { key: "tasks", label: "Tasks", icon: <ListTodo size={14} /> },
    { key: "links", label: "Links", icon: <Link2 size={14} /> },
  ];

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex">
      {/* Timer Section */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <button
          onClick={handleEndSession}
          className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
          aria-label="End focus session"
        >
          <X size={24} />
        </button>

        <div className="flex items-center gap-2 mb-8">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: project?.color }}
          />
          <span className="text-slate-400 text-sm">{project?.name}</span>
        </div>

        <h1 className="text-3xl font-bold text-white text-center mb-12 max-w-2xl">
          {task.title}
        </h1>

        <div className="relative mb-12">
          <div className="text-8xl font-mono font-bold text-white tracking-wider">
            {formatTime(seconds)}
          </div>
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 text-slate-500">
            <Clock size={14} />
            <span className="text-sm">Deep Focus</span>
          </div>
        </div>

        <div
          className="flex items-center gap-4"
          role="group"
          aria-label="Timer controls"
        >
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="w-16 h-16 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition-colors"
            aria-label={isRunning ? "Pause timer" : "Resume timer"}
          >
            {isRunning ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button
            onClick={handleEndSession}
            className="w-16 h-16 rounded-full bg-slate-800 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
            aria-label="Stop and save session"
          >
            <Square size={20} />
          </button>
          <button
            onClick={handleComplete}
            className="px-6 py-3 rounded-full bg-green-600 hover:bg-green-500 text-white font-medium transition-colors"
            aria-label="Complete task and end session"
          >
            Complete Task
          </button>
        </div>

        <div className="mt-12 flex items-center gap-8 text-slate-500 text-sm">
          <div>
            Previous focus:{" "}
            <span className="text-white">{task.focusMinutes}m</span>
          </div>
          <div>
            Session:{" "}
            <span className="text-indigo-400">{Math.ceil(seconds / 60)}m</span>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-[420px] border-l border-slate-800 flex flex-col">
        {/* Tab Bar */}
        <div className="flex border-b border-slate-800">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-white border-b-2 border-indigo-500"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Session Notes */}
          {activeTab === "session" && (
            <textarea
              value={scratchpad}
              onChange={(e) => setScratchpad(e.target.value)}
              placeholder="Capture thoughts, ideas, blockers..."
              aria-label="Session notes"
              className="w-full h-full bg-transparent p-4 text-white placeholder-slate-600 resize-none focus:outline-none font-mono text-sm leading-relaxed"
            />
          )}

          {/* Project Notes */}
          {activeTab === "notes" && (
            <div className="p-4 space-y-3">
              <button
                onClick={() => setAddingNote(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors text-sm"
              >
                <Plus size={14} />
                Add Note
              </button>

              {addingNote && (
                <div className="rounded-lg bg-slate-900 p-3 space-y-2">
                  <input
                    type="text"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder="Note title"
                    autoFocus
                    className="w-full bg-slate-800 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Content..."
                    rows={3}
                    className="w-full bg-slate-800 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setAddingNote(false);
                        setNewNoteTitle("");
                        setNewNoteContent("");
                      }}
                      className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddNote}
                      className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {projectNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg bg-slate-900 p-3 group"
                >
                  {editingNoteId === note.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editNoteTitle}
                        onChange={(e) => setEditNoteTitle(e.target.value)}
                        autoFocus
                        className="w-full bg-slate-800 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <textarea
                        value={editNoteContent}
                        onChange={(e) => setEditNoteContent(e.target.value)}
                        rows={4}
                        className="w-full bg-slate-800 rounded px-3 py-1.5 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingNoteId(null)}
                          className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveNote(note)}
                          className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <h4 className="text-sm font-medium text-white">
                          {note.title}
                        </h4>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditNoteTitle(note.title);
                              setEditNoteContent(note.content);
                            }}
                            className="p-1 text-slate-500 hover:text-white"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1 text-slate-500 hover:text-red-400"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      {note.content && (
                        <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap">
                          {note.content}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}

              {projectNotes.length === 0 && !addingNote && (
                <p className="text-sm text-slate-600 text-center py-8">
                  No notes yet for this project
                </p>
              )}
            </div>
          )}

          {/* Tasks */}
          {activeTab === "tasks" && (
            <div className="p-4 space-y-1">
              {projectTasks.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    t.id === task.id
                      ? "bg-indigo-950/50 border border-indigo-800"
                      : "hover:bg-slate-900"
                  }`}
                >
                  <button
                    onClick={() => handleToggleTask(t)}
                    className="text-slate-500 hover:text-green-400 flex-shrink-0"
                  >
                    {t.status === "completed" ? (
                      <CheckCircle2 size={16} className="text-green-500" />
                    ) : (
                      <Circle size={16} />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm truncate ${
                          t.id === task.id
                            ? "text-white font-medium"
                            : "text-slate-300"
                        }`}
                      >
                        {t.title}
                      </span>
                      {t.id === task.id && (
                        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                          FOCUS
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.priority && (
                        <span
                          className={`text-[10px] ${priorityColor[t.priority]}`}
                        >
                          {t.priority}
                        </span>
                      )}
                      {t.dueDate && (
                        <span className="text-[10px] text-slate-500">
                          {new Date(t.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {t.id !== task.id && (
                    <button
                      onClick={() => handleSwitchTask(t)}
                      className="flex-shrink-0 p-1.5 rounded text-slate-600 hover:text-indigo-400 hover:bg-slate-800 transition-colors"
                      title="Switch focus to this task"
                    >
                      <Focus size={14} />
                    </button>
                  )}
                </div>
              ))}

              {projectTasks.length === 0 && (
                <p className="text-sm text-slate-600 text-center py-8">
                  No active tasks in this project
                </p>
              )}
            </div>
          )}

          {/* Links */}
          {activeTab === "links" && (
            <div className="p-4 space-y-3">
              <button
                onClick={() => setAddingLink(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors text-sm"
              >
                <Plus size={14} />
                Add Link
              </button>

              {addingLink && (
                <div className="rounded-lg bg-slate-900 p-3 space-y-2">
                  <input
                    type="text"
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    placeholder="Link title"
                    autoFocus
                    className="w-full bg-slate-800 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="url"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-800 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setAddingLink(false);
                        setNewLinkTitle("");
                        setNewLinkUrl("");
                      }}
                      className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddLink}
                      className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {projectLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 rounded-lg bg-slate-900 px-3 py-2.5 group"
                >
                  <Link2 size={14} className="text-slate-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-indigo-400 hover:text-indigo-300 truncate block"
                    >
                      {link.title}
                    </a>
                    <span className="text-[10px] text-slate-600 truncate block">
                      {link.url}
                    </span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-slate-500 hover:text-white"
                    >
                      <ExternalLink size={12} />
                    </a>
                    <button
                      onClick={() => handleDeleteLink(link.id)}
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}

              {projectLinks.length === 0 && !addingLink && (
                <p className="text-sm text-slate-600 text-center py-8">
                  No links yet for this project
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
