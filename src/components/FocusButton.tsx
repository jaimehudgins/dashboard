"use client";

import React, { useState } from "react";
import { Focus, Timer, X } from "lucide-react";
import { useApp } from "@/store/store";
import FocusPicker from "./FocusPicker";
import { Task } from "@/types";

interface FocusButtonProps {
  onOpenZenMode: (task: Task) => void;
}

export default function FocusButton({ onOpenZenMode }: FocusButtonProps) {
  const { state } = useApp();
  const [showPicker, setShowPicker] = useState(false);

  // Use the active focus session from state
  const activeFocusSession = state.activeFocusSession;

  const activeTask = activeFocusSession
    ? state.tasks.find((t) => t.id === activeFocusSession.taskId)
    : null;

  const getElapsedMinutes = () => {
    if (!activeFocusSession) return 0;
    const now = new Date();
    const start = new Date(activeFocusSession.startTime);
    return Math.floor((now.getTime() - start.getTime()) / 60000);
  };

  return (
    <>
      <div className="fixed top-4 right-6 z-40">
        {activeFocusSession ? (
          // Active focus session - show compact timer
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <Timer size={18} className="animate-pulse" />
            <div className="flex flex-col items-start">
              <span className="text-xs opacity-90">Focusing on</span>
              <span className="font-medium text-sm truncate max-w-[200px]">
                {activeTask?.title || "Unknown"}
              </span>
            </div>
            <span className="text-sm font-mono ml-2">
              {getElapsedMinutes()}m
            </span>
          </button>
        ) : (
          // No active session - show start button
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 bg-white border-2 border-indigo-600 text-indigo-600 px-4 py-2 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 hover:bg-indigo-50"
          >
            <Focus size={20} />
            <span className="font-medium">Focus</span>
          </button>
        )}
      </div>

      {showPicker && (
        <FocusPicker
          onClose={() => setShowPicker(false)}
          currentFocusSession={activeFocusSession || undefined}
          onOpenZenMode={onOpenZenMode}
        />
      )}
    </>
  );
}
