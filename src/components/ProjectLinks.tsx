"use client";

import React, { useState } from "react";
import {
  Link2,
  Plus,
  Trash2,
  ExternalLink,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Pencil,
  X,
  Check,
} from "lucide-react";
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
import { ProjectLink } from "@/types";

interface ProjectLinksProps {
  projectId: string;
}

interface SortableLinkItemProps {
  link: ProjectLink;
  onEdit: (link: ProjectLink) => void;
  onDelete: (id: string) => void;
}

function SortableLinkItem({ link, onEdit, onDelete }: SortableLinkItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Try to get favicon from URL
  const getFaviconUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=16`;
    } catch {
      return null;
    }
  };

  const faviconUrl = getFaviconUrl(link.url);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-slate-50 transition-colors ${
        isDragging ? "opacity-50 bg-slate-100" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical size={14} />
      </button>

      {faviconUrl ? (
        <img
          src={faviconUrl}
          alt=""
          className="w-4 h-4 flex-shrink-0"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <Link2 size={14} className="text-slate-400 flex-shrink-0" />
      )}

      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 text-sm text-slate-700 hover:text-indigo-600 truncate"
        title={link.url}
      >
        {link.title}
      </a>

      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-slate-400 hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ExternalLink size={14} />
      </a>

      <button
        onClick={() => onEdit(link)}
        className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Pencil size={14} />
      </button>

      <button
        onClick={() => onDelete(link.id)}
        className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function ProjectLinks({ projectId }: ProjectLinksProps) {
  const { dispatch, getProjectLinks } = useApp();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [editingLink, setEditingLink] = useState<ProjectLink | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");

  const links = getProjectLinks(projectId);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = links.findIndex((l) => l.id === active.id);
      const newIndex = links.findIndex((l) => l.id === over.id);
      const newOrder = arrayMove(links, oldIndex, newIndex);

      dispatch({
        type: "REORDER_LINKS",
        payload: newOrder.map((l) => l.id),
      });
    }
  };

  const handleAddLink = () => {
    if (!newTitle.trim() || !newUrl.trim()) return;

    // Ensure URL has protocol
    let url = newUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    const newLink: ProjectLink = {
      id: `link-${Date.now()}`,
      projectId,
      title: newTitle.trim(),
      url,
      displayOrder: links.length,
      createdAt: new Date(),
    };

    dispatch({ type: "ADD_LINK", payload: newLink });
    setNewTitle("");
    setNewUrl("");
    setIsAdding(false);
  };

  const handleEditLink = (link: ProjectLink) => {
    setEditingLink(link);
    setEditTitle(link.title);
    setEditUrl(link.url);
  };

  const handleSaveEdit = () => {
    if (!editingLink || !editTitle.trim() || !editUrl.trim()) return;

    // Ensure URL has protocol
    let url = editUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    dispatch({
      type: "UPDATE_LINK",
      payload: {
        ...editingLink,
        title: editTitle.trim(),
        url,
      },
    });

    setEditingLink(null);
    setEditTitle("");
    setEditUrl("");
  };

  const handleDeleteLink = (linkId: string) => {
    dispatch({ type: "DELETE_LINK", payload: linkId });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          {isCollapsed ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
          <Link2 size={16} />
          <h3 className="font-medium text-sm">Files & Links</h3>
          <span className="text-xs text-slate-400">({links.length})</span>
        </button>

        {!isCollapsed && (
          <button
            onClick={() => setIsAdding(true)}
            className="text-slate-400 hover:text-indigo-500 transition-colors"
            title="Add link"
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {!isCollapsed && (
        <>
          {/* Add Link Form */}
          {isAdding && (
            <div className="mb-3 p-3 bg-slate-50 rounded-lg space-y-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Link title..."
                autoFocus
                className="w-full text-sm bg-white border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddLink();
                  if (e.key === "Escape") {
                    setIsAdding(false);
                    setNewTitle("");
                    setNewUrl("");
                  }
                }}
                className="w-full text-sm bg-white border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddLink}
                  disabled={!newTitle.trim() || !newUrl.trim()}
                  className="flex-1 text-sm bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 text-white px-3 py-1.5 rounded transition-colors"
                >
                  Add Link
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewTitle("");
                    setNewUrl("");
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Edit Link Modal */}
          {editingLink && (
            <div className="mb-3 p-3 bg-indigo-50 rounded-lg space-y-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Link title..."
                autoFocus
                className="w-full text-sm bg-white border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") {
                    setEditingLink(null);
                    setEditTitle("");
                    setEditUrl("");
                  }
                }}
                className="w-full text-sm bg-white border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={!editTitle.trim() || !editUrl.trim()}
                  className="flex-1 text-sm bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 text-white px-3 py-1.5 rounded transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingLink(null);
                    setEditTitle("");
                    setEditUrl("");
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Links List */}
          {links.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={links.map((l) => l.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {links.map((link) => (
                    <SortableLinkItem
                      key={link.id}
                      link={link}
                      onEdit={handleEditLink}
                      onDelete={handleDeleteLink}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            !isAdding && (
              <p className="text-sm text-slate-400 italic text-center py-4">
                No links yet. Click + to add one.
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
