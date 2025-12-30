"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Pause, Play, Square, Clock, FileText } from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";

interface ZenModeProps {
  task: Task;
  onClose: () => void;
}

export default function ZenMode({ task, onClose }: ZenModeProps) {
  const { state, dispatch } = useApp();
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [scratchpad, setScratchpad] = useState("");

  const project = state.projects.find((p) => p.id === task.projectId);

  useEffect(() => {
    // Start focus session
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

  const handleEndSession = useCallback(() => {
    const minutes = Math.ceil(seconds / 60);
    dispatch({
      type: "END_FOCUS",
      payload: { minutes, notes: scratchpad || undefined },
    });
    onClose();
  }, [seconds, scratchpad, dispatch, onClose]);

  const handleComplete = useCallback(() => {
    const minutes = Math.ceil(seconds / 60);
    dispatch({
      type: "END_FOCUS",
      payload: { minutes, notes: scratchpad || undefined },
    });
    dispatch({
      type: "UPDATE_TASK",
      payload: { ...task, status: "completed" },
    });
    onClose();
  }, [seconds, scratchpad, task, dispatch, onClose]);

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex">
      {/* Timer Section */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Close Button */}
        <button
          onClick={handleEndSession}
          className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
          aria-label="End focus session"
        >
          <X size={24} />
        </button>

        {/* Project Badge */}
        <div className="flex items-center gap-2 mb-8">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: project?.color }}
          />
          <span className="text-slate-400 text-sm">{project?.name}</span>
        </div>

        {/* Task Title */}
        <h1 className="text-3xl font-bold text-white text-center mb-12 max-w-2xl">
          {task.title}
        </h1>

        {/* Timer Display */}
        <div className="relative mb-12">
          <div className="text-8xl font-mono font-bold text-white tracking-wider">
            {formatTime(seconds)}
          </div>
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 text-slate-500">
            <Clock size={14} />
            <span className="text-sm">Deep Focus</span>
          </div>
        </div>

        {/* Controls */}
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

        {/* Session Stats */}
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

      {/* Scratchpad Section */}
      <div className="w-96 border-l border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <FileText size={16} className="text-slate-400" />
          <span className="text-sm font-medium text-white">Session Notes</span>
        </div>
        <textarea
          value={scratchpad}
          onChange={(e) => setScratchpad(e.target.value)}
          placeholder="Capture thoughts, ideas, blockers..."
          aria-label="Session notes"
          className="flex-1 bg-transparent p-4 text-white placeholder-slate-600 resize-none focus:outline-none font-mono text-sm leading-relaxed"
        />
      </div>
    </div>
  );
}
