"use client";

import React, { useState } from "react";
import { Trash2, Palette } from "lucide-react";
import { StickyNote as StickyNoteType, StickyNoteColor } from "@/types";

interface StickyNoteProps {
  note: StickyNoteType;
  onUpdate: (note: StickyNoteType) => void;
  onDelete: (id: string) => void;
}

const colorStyles: Record<StickyNoteColor, { bg: string; border: string }> = {
  yellow: { bg: "bg-amber-100", border: "border-amber-200" },
  pink: { bg: "bg-pink-100", border: "border-pink-200" },
  blue: { bg: "bg-blue-100", border: "border-blue-200" },
  green: { bg: "bg-emerald-100", border: "border-emerald-200" },
  purple: { bg: "bg-purple-100", border: "border-purple-200" },
};

const colors: StickyNoteColor[] = ["yellow", "pink", "blue", "green", "purple"];

export default function StickyNote({
  note,
  onUpdate,
  onDelete,
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);

  const style = colorStyles[note.color];

  // Generate a slight rotation for realistic sticky note look
  const rotation = ((note.id.charCodeAt(0) % 5) - 2) * 0.5;

  const handleSave = () => {
    if (title !== note.title || content !== note.content) {
      onUpdate({
        ...note,
        title,
        content,
        updatedAt: new Date(),
      });
    }
    setIsEditing(false);
  };

  const handleColorChange = (color: StickyNoteColor) => {
    onUpdate({
      ...note,
      color,
      updatedAt: new Date(),
    });
    setShowColorPicker(false);
  };

  return (
    <div
      className={`group relative ${style.bg} ${style.border} border-2 rounded-lg p-4 shadow-md hover:shadow-lg transition-all min-h-[180px] flex flex-col`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      {/* Header with actions */}
      <div className="flex items-start justify-between mb-2">
        {isEditing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="flex-1 bg-transparent border-b border-slate-600 text-sm font-semibold focus:outline-none focus:border-slate-800"
            style={{ color: "#1e293b" }}
            placeholder="Note title..."
            autoFocus
          />
        ) : (
          <h3
            className="flex-1 text-sm font-semibold cursor-pointer"
            style={{ color: "#1e293b" }}
            onClick={() => setIsEditing(true)}
          >
            {note.title || "Untitled"}
          </h3>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="p-1 text-slate-500 hover:text-slate-700 rounded"
              title="Change color"
            >
              <Palette size={14} />
            </button>
            {showColorPicker && (
              <div className="absolute right-0 top-6 bg-white border border-slate-200 rounded-lg shadow-lg p-2 flex gap-1 z-10">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorChange(color)}
                    className={`w-6 h-6 rounded-full ${colorStyles[color].bg} ${colorStyles[color].border} border-2 hover:scale-110 transition-transform ${
                      note.color === color ? "ring-2 ring-slate-400" : ""
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => onDelete(note.id)}
            className="p-1 text-slate-500 hover:text-red-500 rounded"
            title="Delete note"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1" onClick={() => !isEditing && setIsEditing(true)}>
        {isEditing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={(e) => {
              // Small delay to allow clicking within the note
              setTimeout(() => handleSave(), 100);
            }}
            className="w-full h-full min-h-[100px] bg-transparent text-sm focus:outline-none resize-none"
            style={{ color: "#1e293b" }}
            placeholder="Write your note..."
            autoFocus
          />
        ) : (
          <p
            className="text-sm whitespace-pre-wrap cursor-pointer min-h-[100px]"
            style={{ color: "#1e293b" }}
          >
            {note.content || "Click to add content..."}
          </p>
        )}
      </div>

      {/* Decorative fold effect */}
      <div
        className={`absolute bottom-0 right-0 w-6 h-6 ${style.bg}`}
        style={{
          background: `linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.05) 50%)`,
        }}
      />
    </div>
  );
}
