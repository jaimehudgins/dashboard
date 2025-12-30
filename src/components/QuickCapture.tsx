"use client";

import React, { useState } from "react";
import { Plus, Zap } from "lucide-react";
import { useApp } from "@/store/store";

export default function QuickCapture() {
  const [input, setInput] = useState("");
  const { dispatch } = useApp();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    dispatch({
      type: "ADD_INBOX_ITEM",
      payload: {
        id: `inbox-${Date.now()}`,
        content: input.trim(),
        createdAt: new Date(),
      },
    });

    setInput("");
  };

  return (
    <div className="border-b border-slate-200 bg-white">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-3 px-8 py-4"
      >
        <div className="flex items-center gap-2 text-indigo-500">
          <Zap size={16} />
          <span className="text-xs font-medium uppercase tracking-wider">
            Quick Capture
          </span>
        </div>
        <div className="flex-1 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Brain dump... Press Enter to capture"
            aria-label="Quick capture input"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
        </div>
        <button
          type="submit"
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Capture
        </button>
      </form>
    </div>
  );
}
