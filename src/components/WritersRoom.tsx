"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Users, Loader2, MessageSquare, GraduationCap } from "lucide-react";
import { Persona, fetchPersonas } from "@/lib/personas";

const ICONS: Record<string, string> = {
  Teacher: "🍎",
  Student: "🎒",
  "Board member": "📊",
  "Past-Jaime": "🔁",
};

export default function WritersRoom() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPersonas().then(setPersonas);
    // Handoff from Sam: a draft stashed in localStorage.
    try {
      const stashed = localStorage.getItem("leo.writersroom.draft");
      if (stashed) {
        setContent(stashed);
        localStorage.removeItem("leo.writersroom.draft");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const react = async () => {
    if (!selected || !content.trim()) return;
    setLoading(true);
    setError(null);
    setReaction(null);
    try {
      const r = await fetch("/api/writers-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId: selected, content }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setReaction(d.reaction || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="text-indigo-500" size={22} />
          The Writers&rsquo; Room
        </h1>
        <p className="text-slate-500 mt-1">
          Get honest pushback before any real person sees your work.
        </p>
      </div>

      {/* Persona picker */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {personas.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            title={p.description || ""}
            className={`text-left rounded-xl border p-3 transition-all ${
              selected === p.id
                ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200"
                : "border-slate-200 bg-white hover:border-indigo-200"
            }`}
          >
            <div className="text-xl mb-1">{ICONS[p.name] || "🗣️"}</div>
            <div className="text-sm font-medium text-slate-800">{p.name}</div>
            <div className="text-xs text-slate-400 line-clamp-2 mt-0.5">
              {p.description}
            </div>
          </button>
        ))}
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={8}
        placeholder="Paste a draft, a lesson, a plan, a post — whatever you want a reaction to."
        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y mb-3"
      />

      <button
        onClick={react}
        disabled={loading || !selected || !content.trim()}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
      >
        {loading ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <MessageSquare size={15} />
        )}
        {selected
          ? `Get ${personas.find((p) => p.id === selected)?.name}'s reaction`
          : "Pick a persona"}
      </button>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      {reaction && (
        <div className="mt-5 bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <GraduationCap size={13} />
            {personas.find((p) => p.id === selected)?.name} says
          </div>
          <div className="text-sm text-slate-800 prose-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{reaction}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
