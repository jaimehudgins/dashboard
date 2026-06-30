"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Lightbulb, Plus, Archive, Trash2, Loader2, Inbox } from "lucide-react";
import {
  BacklogItem,
  fetchBacklog,
  addBacklogItem,
  setBacklogArchived,
  deleteBacklogItem,
} from "@/lib/backlog";

export default function Backlog() {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const load = (archived: boolean) => {
    setLoading(true);
    fetchBacklog(archived)
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(showArchived);
  }, [showArchived]);

  const add = async () => {
    const c = text.trim();
    if (!c) return;
    const item = await addBacklogItem(c, "manual");
    if (item && !showArchived) setItems((prev) => [item, ...prev]);
    setText("");
  };

  const archive = async (item: BacklogItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await setBacklogArchived(item.id, !item.archived);
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deleteBacklogItem(id);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-amber-500" />
            Backlog
          </h1>
          <p className="text-slate-500 mt-1">
            The later-list — ideas and someday items worth keeping, not yet
            tasks.
          </p>
        </div>
        <button
          onClick={() => setShowArchived((s) => !s)}
          className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5"
        >
          <Archive size={14} />
          {showArchived ? "Active" : "Archived"}
        </button>
      </div>

      {!showArchived && (
        <div className="flex items-center gap-2 mb-5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Capture an idea or something to revisit later…"
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            onClick={add}
            disabled={!text.trim()}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            <Plus size={15} />
            Add
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500">
          <Inbox className="mx-auto text-slate-300 mb-3" size={32} />
          {showArchived
            ? "Nothing archived."
            : "Your backlog is empty. Capture an idea above, or route one here from a meeting."}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex items-start gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3"
            >
              <Lightbulb
                size={15}
                className="text-amber-400 flex-shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800">{item.content}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {item.source && item.source !== "manual"
                    ? `${item.source} · `
                    : ""}
                  {format(new Date(item.created_at), "MMM d")}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => archive(item)}
                  title={item.archived ? "Restore" : "Archive"}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
                >
                  <Archive size={14} />
                </button>
                <button
                  onClick={() => remove(item.id)}
                  title="Delete"
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
