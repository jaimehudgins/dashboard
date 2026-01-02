"use client";

import React from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Task } from "@/types";

interface TaskMentionProps {
  task: Task;
  onClick?: (task: Task) => void;
}

export default function TaskMention({ task, onClick }: TaskMentionProps) {
  const isCompleted = task.status === "completed";

  return (
    <button
      onClick={() => onClick?.(task)}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-sm font-medium transition-colors ${
        isCompleted
          ? "bg-green-50 text-green-700 hover:bg-green-100"
          : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
      }`}
    >
      {isCompleted ? (
        <CheckCircle2 size={12} className="text-green-500" />
      ) : (
        <Circle size={12} className="text-indigo-400" />
      )}
      <span className={isCompleted ? "line-through" : ""}>{task.title}</span>
    </button>
  );
}

// Parse content and extract task mentions
// Syntax: @[task-id] or @[task title]
export function parseTaskMentions(
  content: string,
  tasks: Task[]
): { type: "text" | "task"; content: string; task?: Task }[] {
  const parts: { type: "text" | "task"; content: string; task?: Task }[] = [];

  // Match @[anything] pattern
  const regex = /@\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }

    const reference = match[1];
    // Try to find task by ID first, then by title (case-insensitive)
    const task = tasks.find(
      (t) =>
        t.id === reference ||
        t.title.toLowerCase() === reference.toLowerCase()
    );

    if (task) {
      parts.push({
        type: "task",
        content: reference,
        task,
      });
    } else {
      // Keep the original text if task not found
      parts.push({
        type: "text",
        content: match[0],
      });
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({
      type: "text",
      content: content.slice(lastIndex),
    });
  }

  return parts;
}
