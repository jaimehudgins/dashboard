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

// Component to render note content with task mentions
interface NoteContentProps {
  content: string;
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

function NoteContent({ content, tasks, onTaskClick }: NoteContentProps) {
  const lines = content.split("\n");

  return (
    <div className="prose prose-sm max-w-none">
      {lines.map((line, lineIndex) => {
        const parts = parseTaskMentions(line, tasks);
        const isHeading = /^#{1,6}\s/.test(line);
        const isList = /^[\-\*]\s/.test(line) || /^\d+\.\s/.test(line);
        const isBlockquote = /^>\s/.test(line);

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
        return <ReactMarkdown key={lineIndex}>{line}</ReactMarkdown>;
      })}
    </div>
  );
}

interface SortableNoteItemProps {
  note: ProjectNote;
  isExpanded: boolean;
  isEditing: boolean;
  editingTitle: boolean;
  tasks: Task[];
  onToggleExpand: () => void;
  onToggleEdit: () => void;
  onStartEditTitle: () => void;
  onStopEditTitle: () => void;
  onUpdateNote: (note: ProjectNote, updates: Partial<ProjectNote>) => void;
  onDeleteNote: (noteId: string) => void;
  onTogglePin: (note: ProjectNote) => void;
  onTaskClick: (task: Task) => void;
}

function SortableNoteItem({
  note,
  isExpanded,
  isEditing,
  editingTitle,
  tasks,
  onToggleExpand,
  onToggleEdit,
  onStartEditTitle,
  onStopEditTitle,
  onUpdateNote,
  onDeleteNote,
  onTogglePin,
  onTaskClick,
}: SortableNoteItemProps) {
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
      className={`bg-white border border-slate-200 rounded-lg overflow-hidden ${isDragging ? "opacity-50" : ""}`}
    >
      {/* Note Header - Always visible */}
      <div className="group flex items-center gap-2 p-3 hover:bg-slate-50 transition-colors">
        <button
          {...attributes}
          {...listeners}
          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </button>

        <button
          onClick={onToggleExpand}
          className="text-slate-400 hover:text-slate-600"
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {note.isPinned && <Pin size={12} className="text-indigo-500" />}

        {editingTitle ? (
          <input
            type="text"
            value={note.title}
            onChange={(e) => onUpdateNote(note, { title: e.target.value })}
            onBlur={onStopEditTitle}
            onKeyDown={(e) => e.key === "Enter" && onStopEditTitle()}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <button
            onClick={onToggleExpand}
            className="flex-1 text-left text-sm font-medium text-slate-900 hover:text-indigo-600 transition-colors truncate"
          >
            {note.title}
          </button>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartEditTitle();
            }}
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
            title="Edit title"
          >
            <Edit3 size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(note);
            }}
            className="p-1 text-slate-400 hover:text-indigo-500 transition-colors"
            title={note.isPinned ? "Unpin" : "Pin"}
          >
            {note.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteNote(note.id);
            }}
            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
            title="Delete note"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Note Content - Collapsible */}
      {isExpanded && (
        <div className="border-t border-slate-100">
          {/* Edit/Preview Toggle */}
          <div className="flex justify-end p-2 border-b border-slate-100 bg-slate-50">
            <button
              onClick={onToggleEdit}
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                isEditing
                  ? "text-indigo-500"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {isEditing ? <Eye size={14} /> : <Edit3 size={14} />}
              {isEditing ? "Preview" : "Edit"}
            </button>
          </div>

          {/* Note Body */}
          <div className="max-h-[300px] overflow-auto">
            {isEditing ? (
              <div className="flex flex-col">
                <textarea
                  value={note.content}
                  onChange={(e) =>
                    onUpdateNote(note, { content: e.target.value })
                  }
                  className="w-full min-h-[200px] bg-transparent p-4 text-slate-900 placeholder-slate-400 resize-none focus:outline-none font-mono text-sm leading-relaxed"
                  placeholder="Write your notes in Markdown... Use @[task name] to link to tasks."
                />
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-1">
                  <AtSign size={12} />
                  Tip: Use @[task name] to link to a task
                </div>
              </div>
            ) : (
              <div className="p-4">
                {note.content ? (
                  <NoteContent
                    content={note.content}
                    tasks={tasks}
                    onTaskClick={onTaskClick}
                  />
                ) : (
                  <p className="text-slate-400 italic text-sm">
                    No content yet. Click Edit to start writing.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectNotes({ projectId }: ProjectNotesProps) {
  const { state, getProjectNotes, dispatch } = useApp();
  const notes = getProjectNotes(projectId);
  const projectTasks = state.tasks.filter((t) => t.projectId === projectId);

  const sortedNotes = [...notes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  });

  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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
    setExpandedNoteId(newNote.id);
    setShowTemplateSelector(false);
    if (template.id === "blank") {
      setEditingNoteId(newNote.id);
      setEditingTitleId(newNote.id);
    }
  };

  const handleUpdateNote = (
    note: ProjectNote,
    updates: Partial<ProjectNote>,
  ) => {
    dispatch({
      type: "UPDATE_NOTE",
      payload: { ...note, ...updates, updatedAt: new Date() },
    });
  };

  const handleDeleteNote = (noteId: string) => {
    dispatch({ type: "DELETE_NOTE", payload: noteId });
    if (expandedNoteId === noteId) {
      setExpandedNoteId(null);
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
      dispatch({
        type: "REORDER_NOTES",
        payload: reorderedNotes.map((n) => n.id),
      });
    }
  };

  if (sortedNotes.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-slate-600">
            <FileText size={16} />
            <h3 className="font-medium text-sm">Notes</h3>
            <span className="text-xs text-slate-400">(0)</span>
          </div>
          <button
            onClick={handleAddNote}
            className="text-slate-400 hover:text-indigo-500 transition-colors"
            title="Add note"
          >
            <Plus size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-400 italic text-center py-4">
          No notes yet. Click + to add one.
        </p>

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
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <FileText size={16} />
          <h3 className="font-medium text-sm">Notes</h3>
          <span className="text-xs text-slate-400">({sortedNotes.length})</span>
        </button>

        {!isCollapsed && (
          <button
            onClick={handleAddNote}
            className="text-slate-400 hover:text-indigo-500 transition-colors"
            title="Add note"
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {!isCollapsed && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedNotes.map((n) => n.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {sortedNotes.map((note) => (
                <SortableNoteItem
                  key={note.id}
                  note={note}
                  isExpanded={expandedNoteId === note.id}
                  isEditing={editingNoteId === note.id}
                  editingTitle={editingTitleId === note.id}
                  tasks={projectTasks}
                  onToggleExpand={() =>
                    setExpandedNoteId(
                      expandedNoteId === note.id ? null : note.id,
                    )
                  }
                  onToggleEdit={() =>
                    setEditingNoteId(editingNoteId === note.id ? null : note.id)
                  }
                  onStartEditTitle={() => setEditingTitleId(note.id)}
                  onStopEditTitle={() => setEditingTitleId(null)}
                  onUpdateNote={handleUpdateNote}
                  onDeleteNote={handleDeleteNote}
                  onTogglePin={handleTogglePin}
                  onTaskClick={setSelectedTask}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
