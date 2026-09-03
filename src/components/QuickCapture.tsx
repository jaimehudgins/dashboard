"use client";

import React, { useRef, useState } from "react";
import { Plus, Zap, ClipboardList, Mic } from "lucide-react";
import { useApp } from "@/store/store";
import { Priority } from "@/types";
import TaskCreateModal from "./TaskCreateModal";

interface SpeechRecognitionResultEventLike {
  results: ArrayLike<{ [index: number]: { transcript: string } }>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (event: SpeechRecognitionResultEventLike) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export default function QuickCapture() {
  const [input, setInput] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { dispatch } = useApp();

  // Voice capture via the Web Speech API (Chrome/Safari).
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baselineRef = useRef("");

  const toggleMic = () => {
    const speechWindow =
      typeof window !== "undefined" ? (window as SpeechWindow) : null;
    const SR =
      speechWindow?.SpeechRecognition ??
      speechWindow?.webkitSpeechRecognition ??
      null;
    if (!SR) {
      alert("Voice input isn't supported in this browser. Try Chrome or Safari.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    baselineRef.current = input.trim() ? `${input.trim()} ` : "";
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionResultEventLike) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++)
        s += e.results[i][0].transcript;
      setInput(baselineRef.current + s);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    dispatch({
      type: "ADD_TASK",
      payload: {
        id: `task-${Date.now()}`,
        title: input.trim(),
        priority: "medium" as Priority,
        status: "pending",
        projectId: null,
        createdAt: new Date(),
        focusMinutes: 0,
      },
    });

    setInput("");
  };

  return (
    <>
      <div className="bg-white">
        <div className="flex items-center gap-3 px-8 py-4">
          {/* New Task button */}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
          >
            <ClipboardList size={16} />
            Add work
          </button>

          <div className="h-8 w-px bg-slate-200 flex-shrink-0" />

          {/* Quick Capture */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-3 flex-1"
          >
            <div className="flex items-center gap-2 text-slate-400 flex-shrink-0">
              <Zap size={14} />
              <span className="text-xs font-medium uppercase tracking-wider">
                Quick
              </span>
            </div>
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  listening ? "Listening… speak now" : "What needs to happen? Press Enter to capture"
                }
                aria-label="Quick capture input"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-4 pr-11 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={toggleMic}
                title={listening ? "Stop" : "Speak to capture"}
                aria-label={listening ? "Stop voice capture" : "Voice capture"}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors ${
                  listening
                    ? "text-white bg-red-500 animate-pulse"
                    : "text-slate-400 hover:text-indigo-600 hover:bg-slate-100"
                }`}
              >
                <Mic size={16} />
              </button>
            </div>

            <button
              type="submit"
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
            >
              <Plus size={16} />
              Capture
            </button>
          </form>
        </div>
      </div>

      {showCreateModal && (
        <TaskCreateModal onClose={() => setShowCreateModal(false)} />
      )}
    </>
  );
}
