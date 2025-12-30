"use client";

import React from "react";
import { X } from "lucide-react";
import { Tag } from "@/types";

interface TagBadgeProps {
  tag: Tag;
  onRemove?: () => void;
  size?: "sm" | "md";
}

export default function TagBadge({ tag, onRemove, size = "sm" }: TagBadgeProps) {
  const sizeClasses = size === "sm"
    ? "text-xs px-2 py-0.5"
    : "text-sm px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses}`}
      style={{
        backgroundColor: `${tag.color}20`,
        color: tag.color,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-70 transition-opacity"
          aria-label={`Remove ${tag.name} tag`}
        >
          <X size={size === "sm" ? 12 : 14} />
        </button>
      )}
    </span>
  );
}
