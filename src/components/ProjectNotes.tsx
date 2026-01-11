"use client";

import React, { useState } from "react";
import {
  FileText,
  Plus,
  Edit3,
  Eye,
  Trash2,
  Pin,
  PinOff,
  GripVertical,
  AtSign,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useApp } from "@/store/store";
import { ProjectNote, Task } from "@/types";
import TaskMention, { parseTaskMentions } from "./TaskMention";
import TaskEditModal from "./TaskEditModal";
import NoteTemplateSelector, { NoteTemplate } from "./NoteTemplateSelector";

interface ProjectNotesProps {
  projectId: string;
}

interface SortableNoteTabProps {
  note: ProjectNote;
  isActive: boolean;
  onClick: () => void;
  onPin: () => void;
  onDelete: () => void;
}

function SortableNoteTab({
  note,
  isActive,
  onClick,
  onPin,
  onDelete,
}: SortableNoteTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 px-3 py-2 rounded-t-lg cursor-pointer transition-colors ${
        isActive
          ? "bg-white border-t border-l border-r border-slate-200 -mb-px"
          : "bg-slate-100 hover:bg-slate-200"
      } ${isDragging ? "opacity-50" : ""}`}
      onClick={onClick}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={12} />
      </button>
      {note.isPinned && <Pin size={12} className="text-indigo-500" />}
      <span
        className={`text-sm truncate max-w-[120px] ${isActive ? "font-medium text-slate-900" : "text-slate-600"}`}
      >
        {note.title}
      </span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPin();
          }}
          className="p-0.5 text-slate-400 hover:text-indigo-500 transition-colors"
          title={note.isPinned ? "Unpin" : "Pin"}
        >
          {note.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-0.5 text-slate-400 hover:text-red-500 transition-colors"
          title="Delete note"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// Component to render note content with task mentions
interface NoteContentProps {
  content: string;
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

function NoteContent({ content, tasks, onTaskClick }: NoteContentProps) {
  // Split content by lines and process each line for task mentions
  const lines = content.split("\n");

  return (
    <div className="prose prose-sm max-w-none">
      {lines.map((line, lineIndex) => {
        const parts = parseTaskMentions(line, tasks);

        // Check if this is a markdown heading, list, etc.
        const isHeading = /^#{1,6}\s/.test(line);
        const isList = /^[\-\*]\s/.test(line) || /^\d+\.\s/.test(line);
        const isBlockquote = /^>\s/.test(line);

        // For simple lines with task mentions, render inline
        if (parts.some((p) => p.type === "task")) {
          return (
            <p
              key={lineIndex}
              className={`${isHeading ? "font-bold text-lg" : ""} ${isList ? "ml-4" : ""} ${isBlockquote ? "border-l-4 border-slate-200 pl-3 italic" : ""}`}
            >
              {parts.map((part, partIndex) => {
                if (part.type === "task" && part.task) {
                  return (
                    <TaskMention
                      key={partIndex}
                      task={part.task}
                      onClick={onTaskClick}
                    />
                  );
                }
                return <span key={partIndex}>{part.content}</span>;
              })}
            </p>
          );
        }

        // For lines without task mentions, use ReactMarkdown
        return <ReactMarkdown key={lineIndex}>{line}</ReactMarkdown>;
      })}
    </div>
  );
}

export default function ProjectNotes({ projectId }: ProjectNotesProps) {
  const { state, getProjectNotes, dispatch } = useApp();
  const notes = getProjectNotes(projectId);
  const projectTasks = state.tasks.filter((t) => t.projectId === projectId);

  // Sort notes: pinned first, then by display order
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  });

  const [activeNoteId, setActiveNoteId] = useState<string | null>(
    sortedNotes[0]?.id || null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeNote = sortedNotes.find((n) => n.id === activeNoteId);

  const handleAddNote = () => {
    setShowTemplateSelector(true);
  };

  const handleSelectTemplate = (template: NoteTemplate) => {
    const newNote: ProjectNote = {
      id: `note-${Date.now()}`,
      projectId,
      title: template.id === "blank" ? "New Note" : template.name,
      content: template.content,
      displayOrder: sortedNotes.length,
      isPinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dispatch({ type: "ADD_NOTE", payload: newNote });
    setActiveNoteId(newNote.id);
    setShowTemplateSelector(false);
    setIsEditing(template.id === "blank"); // Only edit mode for blank notes
    setEditingTitle(template.id === "blank");
  };

  const handleUpdateNote = (updates: Partial<ProjectNote>) => {
    if (!activeNote) return;
    const updatedNote = {
      ...activeNote,
      ...updates,
      updatedAt: new Date(),
    };
    dispatch({ type: "UPDATE_NOTE", payload: updatedNote });
  };

  const handleDeleteNote = (noteId: string) => {
    dispatch({ type: "DELETE_NOTE", payload: noteId });
    if (activeNoteId === noteId) {
      const remaining = sortedNotes.filter((n) => n.id !== noteId);
      setActiveNoteId(remaining[0]?.id || null);
    }
  };

  const handleTogglePin = (note: ProjectNote) => {
    dispatch({
      type: "UPDATE_NOTE",
      payload: { ...note, isPinned: !note.isPinned, updatedAt: new Date() },
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedNotes.findIndex((n) => n.id === active.id);
      const newIndex = sortedNotes.findIndex((n) => n.id === over.id);

      const reorderedNotes = arrayMove(sortedNotes, oldIndex, newIndex);
      const noteIds = reorderedNotes.map((n) => n.id);

      dispatch({ type: "REORDER_NOTES", payload: noteIds });
    }
  };

  // If no notes exist, show create prompt
  if (sortedNotes.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <FileText size={18} />
            Notes
          </h2>
        </div>
        <div className="bg-white border border-slate-200 border-dashed rounded-xl p-8 text-center">
          <FileText className="mx-auto text-slate-300 mb-3" size={32} />
          <p className="text-sm text-slate-500 mb-4">No notes yet</p>
          <button
            onClick={handleAddNote}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Create Note
          </button>
        </div>

        {showTemplateSelector && (
          <NoteTemplateSelector
            onSelect={handleSelectTemplate}
            onClose={() => setShowTemplateSelector(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 text-lg font-semibold text-slate-900 hover:text-slate-700 transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight size={18} className="text-slate-400" />
          ) : (
            <ChevronDown size={18} className="text-slate-400" />
          )}
          <FileText size={18} />
          Notes
          <span className="text-sm font-normal text-slate-400">
            ({sortedNotes.length})
          </span>
        </button>
        {!isCollapsed && (
          <button
            onClick={handleAddNote}
            className="flex items-center gap-1.5 text-indigo-500 hover:text-indigo-600 text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Add Note
          </button>
        )}
      </div>

      {!isCollapsed && (
        <>
          {/* Tabs */}
          <div className="border-b border-slate-200">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortedNotes.map((n) => n.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex items-center gap-1 overflow-x-auto pb-px">
                  {sortedNotes.map((note) => (
                    <SortableNoteTab
                      key={note.id}
                      note={note}
                      isActive={note.id === activeNoteId}
                      onClick={() => setActiveNoteId(note.id)}
                      onPin={() => handleTogglePin(note)}
                      onDelete={() => handleDeleteNote(note.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Note Content */}
          {activeNote && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Note Header */}
              <div className="flex items-center justify-between p-3 border-b border-slate-100">
                {editingTitle ? (
                  <input
                    type="text"
                    value={activeNote.title}
                    onChange={(e) =>
                      handleUpdateNote({ title: e.target.value })
                    }
                    onBlur={() => setEditingTitle(false)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && setEditingTitle(false)
                    }
                    autoFocus
                    className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <button
                    onClick={() => setEditingTitle(true)}
                    className="text-sm font-medium text-slate-900 hover:text-indigo-600 transition-colors"
                  >
                    {activeNote.title}
                  </button>
                )}
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    isEditing
                      ? "text-indigo-500"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {isEditing ? <Eye size={16} /> : <Edit3 size={16} />}
                  {isEditing ? "Preview" : "Edit"}
                </button>
              </div>

              {/* Note Body */}
              <div className="h-[400px]">
                {isEditing ? (
                  <div className="h-full flex flex-col">
                    <textarea
                      value={activeNote.content}
                      onChange={(e) =>
                        handleUpdateNote({ content: e.target.value })
                      }
                      className="w-full flex-1 bg-transparent p-4 text-slate-900 placeholder-slate-400 resize-none focus:outline-none font-mono text-sm leading-relaxed"
                      placeholder="Write your notes in Markdown... Use @[task name] to link to tasks."
                    />
                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-1">
                      <AtSign size={12} />
                      Tip: Use @[task name] to link to a task
                    </div>
                  </div>
                ) : (
                  <div className="p-4 overflow-auto h-full">
                    {activeNote.content ? (
                      <NoteContent
                        content={activeNote.content}
                        tasks={projectTasks}
                        onTaskClick={setSelectedTask}
                      />
                    ) : (
                      <p className="text-slate-400 italic">
                        No content yet. Click Edit to start writing.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {selectedTask && (
        <TaskEditModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {showTemplateSelector && (
        <NoteTemplateSelector
          onSelect={handleSelectTemplate}
          onClose={() => setShowTemplateSelector(false)}
        />
      )}
    </div>
  );
}
