"use client";

import React, { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Radio,
  Loader2,
  RefreshCw,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Settings2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import CharacterQuote from "./CharacterQuote";
import {
  FieldSignal,
  FieldSource,
  fetchSignals,
  fetchSources,
  addSource,
  deleteSource,
  setSourceActive,
  toggleSaved,
} from "@/lib/field-intel";

function relColor(r: number): string {
  if (r >= 70) return "bg-emerald-50 text-emerald-700";
  if (r >= 40) return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-500";
}

export default function CJ() {
  const [signals, setSignals] = useState<FieldSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedOnly, setSavedOnly] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [sources, setSources] = useState<FieldSource[]>([]);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const load = useCallback((saved: boolean) => {
    setLoading(true);
    fetchSignals(saved)
      .then(setSignals)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load(savedOnly);
  }, [load, savedOnly]);

  const openSources = async () => {
    setShowSources(true);
    setSources(await fetchSources());
  };

  const scan = async () => {
    setScanning(true);
    setError(null);
    try {
      const r = await fetch("/api/field/scan", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Scan failed");
      load(savedOnly);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const save = async (s: FieldSignal) => {
    setSignals((p) =>
      p.map((x) => (x.id === s.id ? { ...x, saved: !x.saved } : x)),
    );
    await toggleSaved(s.id, !s.saved);
  };

  const addSrc = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    await addSource(newName.trim(), newUrl.trim());
    setNewName("");
    setNewUrl("");
    setSources(await fetchSources());
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Radio className="text-indigo-500" size={22} />
            CJ
          </h1>
          <CharacterQuote character="cj" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openSources}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <Settings2 size={15} />
            Sources
          </button>
          <button
            onClick={scan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            {scanning ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            {scanning ? "Scanning…" : "Scan now"}
          </button>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm mb-4">
        <button
          onClick={() => setSavedOnly(false)}
          className={`px-3 py-1.5 font-medium ${!savedOnly ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          Digest
        </button>
        <button
          onClick={() => setSavedOnly(true)}
          className={`px-3 py-1.5 font-medium border-l border-slate-200 ${savedOnly ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          Saved
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" /> Loading…
        </div>
      ) : signals.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500">
          {savedOnly
            ? "Nothing saved yet."
            : "No signals yet. Add a source or two, then Scan now."}
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map((s) => (
            <div
              key={s.id}
              className="bg-white border border-slate-200 rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${relColor(s.relevance)}`}
                  title="Relevance"
                >
                  {s.relevance}
                </span>
                <div className="flex-1 min-w-0">
                  <a
                    href={s.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-slate-900 hover:text-indigo-700 inline-flex items-center gap-1"
                  >
                    {s.title}
                    <ExternalLink size={12} className="text-slate-300 flex-shrink-0" />
                  </a>
                  {s.summary && (
                    <p className="text-sm text-slate-500 mt-1">{s.summary}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 mt-1.5">
                    {s.source_name && <span>{s.source_name}</span>}
                    {s.published_at && (
                      <span>· {format(new Date(s.published_at), "MMM d")}</span>
                    )}
                    {s.tags?.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => save(s)}
                  className={`flex-shrink-0 ${s.saved ? "text-indigo-600" : "text-slate-300 hover:text-slate-500"}`}
                  title={s.saved ? "Saved" : "Save for later"}
                >
                  {s.saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sources modal */}
      {showSources && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={() => setShowSources(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Sources (RSS)</h2>
              <button
                onClick={() => setShowSources(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              {sources.length === 0 && (
                <p className="text-sm text-slate-400">
                  No sources yet. Add an RSS feed — e.g. Hechinger Report
                  (hechingerreport.org/feed), EdSurge, a funder blog, a policy
                  tracker.
                </p>
              )}
              {sources.map((src) => (
                <div
                  key={src.id}
                  className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={src.active}
                    onChange={async () => {
                      await setSourceActive(src.id, !src.active);
                      setSources(await fetchSources());
                    }}
                    className="flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 truncate">{src.name}</p>
                    <p className="text-xs text-slate-400 truncate">{src.url}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await deleteSource(src.id);
                      setSources(await fetchSources());
                    }}
                    className="text-slate-300 hover:text-red-500 flex-shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-slate-100 space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Source name"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <div className="flex gap-2">
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="RSS feed URL"
                  className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  onClick={addSrc}
                  disabled={!newName.trim() || !newUrl.trim()}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md"
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
