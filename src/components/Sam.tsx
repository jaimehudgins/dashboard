"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  PenLine,
  Plus,
  Loader2,
  ArrowLeft,
  Trash2,
  Eye,
  Edit3,
  Check,
  FileText,
} from "lucide-react";
import CharacterQuote from "./CharacterQuote";
import {
  WritingDraft,
  DraftStatus,
  fetchDrafts,
  createDraft,
  updateDraft,
  deleteDraft,
} from "@/lib/writing";

const STATUS_META: Record<DraftStatus, { label: string; cls: string }> = {
  in_progress: { label: "In progress", cls: "bg-amber-50 text-amber-700" },
  ready_to_publish: { label: "Ready", cls: "bg-emerald-50 text-emerald-700" },
  published: { label: "Published", cls: "bg-indigo-50 text-indigo-700" },
  archived: { label: "Archived", cls: "bg-slate-100 text-slate-500" },
};
const AUDIENCES = ["LinkedIn", "Blog", "Internal", "Conference talk"];
const STATUS_FILTERS: { id: "all" | DraftStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "In progress" },
  { id: "ready_to_publish", label: "Ready" },
  { id: "published", label: "Published" },
  { id: "archived", label: "Archived" },
];

const md = {
  p: (p: any) => <p className="mb-3 leading-relaxed" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-6 mb-3 space-y-1" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-6 mb-3 space-y-1" {...p} />,
  h1: (p: any) => <h1 className="text-2xl font-bold mt-5 mb-2" {...p} />,
  h2: (p: any) => <h2 className="text-xl font-bold mt-4 mb-2" {...p} />,
  h3: (p: any) => <h3 className="text-lg font-semibold mt-3 mb-1" {...p} />,
  blockquote: (p: any) => (
    <blockquote className="border-l-4 border-slate-200 pl-4 italic text-slate-600 my-3" {...p} />
  ),
  a: (p: any) => <a className="text-indigo-600 underline" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-slate-900" {...p} />,
};

export default function Sam() {
  const [drafts, setDrafts] = useState<WritingDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | DraftStatus>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchDrafts()
      .then(setDrafts)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const open = drafts.find((d) => d.id === openId) || null;

  const newDraft = async () => {
    const d = await createDraft();
    if (d) {
      setDrafts((p) => [d, ...p]);
      setOpenId(d.id);
    }
  };

  if (open) {
    return (
      <Editor
        key={open.id}
        draft={open}
        onBack={() => setOpenId(null)}
        onPatch={(patch) =>
          setDrafts((p) =>
            p.map((d) => (d.id === open.id ? { ...d, ...patch } : d)),
          )
        }
        onDelete={async () => {
          setDrafts((p) => p.filter((d) => d.id !== open.id));
          setOpenId(null);
          await deleteDraft(open.id);
        }}
      />
    );
  }

  const visible = filter === "all" ? drafts : drafts.filter((d) => d.status === filter);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PenLine className="text-indigo-500" size={22} />
            Sam
          </h1>
          <CharacterQuote character="sam" />
        </div>
        <button
          onClick={newDraft}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          <Plus size={15} />
          New draft
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === f.id
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" /> Loading…
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500">
          <FileText className="mx-auto text-slate-300 mb-3" size={32} />
          {filter === "all"
            ? "No drafts yet. Start something."
            : "Nothing here."}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((d) => (
            <button
              key={d.id}
              onClick={() => setOpenId(d.id)}
              className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900 truncate">
                  {d.title || "Untitled"}
                </span>
                <span
                  className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_META[d.status].cls}`}
                >
                  {STATUS_META[d.status].label}
                </span>
              </div>
              {d.content && (
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                  {d.content.replace(/[#*_>`]/g, "").slice(0, 160)}
                </p>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                {d.audience && <span>{d.audience}</span>}
                {d.audience && <span>·</span>}
                <span>{format(new Date(d.updated_at), "MMM d")}</span>
                {(d.tags || []).slice(0, 3).map((t) => (
                  <span key={t} className="text-slate-400">
                    #{t}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Editor({
  draft,
  onBack,
  onPatch,
  onDelete,
}: {
  draft: WritingDraft;
  onBack: () => void;
  onPatch: (patch: Partial<WritingDraft>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const [status, setStatus] = useState<DraftStatus>(draft.status);
  const [audience, setAudience] = useState(draft.audience || "");
  const [tags, setTags] = useState((draft.tags || []).join(", "));
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(true);
  const mounted = useRef(false);

  // Debounced autosave.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setSaved(false);
    const patch = {
      title,
      content,
      status,
      audience: audience || null,
      tags: tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const t = setTimeout(async () => {
      await updateDraft(draft.id, patch);
      onPatch(patch);
      setSaved(true);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, status, audience, tags]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          All drafts
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {saved ? "Saved" : "Saving…"}
          </span>
          <button
            onClick={() => setPreview((p) => !p)}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            {preview ? <Edit3 size={15} /> : <Eye size={15} />}
            {preview ? "Edit" : "Preview"}
          </button>
          <button
            onClick={onDelete}
            className="text-slate-400 hover:text-red-500"
            title="Delete draft"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full text-2xl font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none mb-3"
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as DraftStatus)}
          className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
        >
          {(Object.keys(STATUS_META) as DraftStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
        >
          <option value="">Audience…</option>
          {AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags, comma separated"
          className="flex-1 min-w-[10rem] text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
      </div>

      {preview ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 min-h-[24rem] text-slate-800">
          {content.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
              {content}
            </ReactMarkdown>
          ) : (
            <p className="text-slate-300">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write. Markdown works. Half-formed thoughts welcome."
          className="w-full min-h-[24rem] bg-white border border-slate-200 rounded-xl p-6 text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y font-mono text-sm"
        />
      )}
    </div>
  );
}
