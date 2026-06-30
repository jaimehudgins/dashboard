"use client";

import React, { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Search,
  Loader2,
  FileText,
  FileSpreadsheet,
  Presentation,
  Folder,
  File as FileIcon,
  ExternalLink,
} from "lucide-react";
import CharacterQuote from "./CharacterQuote";
import { DriveFile } from "@/lib/drive";

function iconFor(type: string) {
  if (type === "Doc" || type === "Word") return FileText;
  if (type === "Sheet" || type === "Excel") return FileSpreadsheet;
  if (type === "Slides" || type === "PowerPoint") return Presentation;
  if (type === "Folder") return Folder;
  return FileIcon;
}

export default function MrsL() {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((q: string) => {
    setLoading(true);
    setError(null);
    fetch(`/api/drive/search?q=${encodeURIComponent(q)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Search failed");
        return d;
      })
      .then((d) => setFiles(d.files || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    run("");
  }, [run]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Folder className="text-indigo-500" size={22} />
          Drive
        </h1>
        <CharacterQuote character="mrsl" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
        className="relative mb-5"
      >
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your Drive by name or content…"
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </form>

      {error && (
        <p className="text-sm text-red-600 mb-4 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!loading && (
        <p className="text-xs text-slate-400 mb-2">
          {query.trim() ? `Results for “${query.trim()}”` : "Recently modified"}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" /> Searching…
        </div>
      ) : files.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500">
          Nothing found.
        </div>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => {
            const Icon = iconFor(f.type);
            return (
              <a
                key={f.id}
                href={f.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-indigo-200 hover:shadow-sm transition-all"
              >
                <Icon size={18} className="text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {f.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {f.type}
                    {f.modifiedTime &&
                      ` · ${format(new Date(f.modifiedTime), "MMM d, yyyy")}`}
                    {f.owner ? ` · ${f.owner}` : ""}
                  </p>
                </div>
                <ExternalLink
                  size={14}
                  className="text-slate-300 group-hover:text-slate-500 flex-shrink-0"
                />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
