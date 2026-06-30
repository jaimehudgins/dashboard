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
  Sparkles,
  ShieldCheck,
  X,
} from "lucide-react";
import CharacterQuote from "./CharacterQuote";
import { crmSupabase, isCrmConfigured } from "@/lib/crm-supabase";
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

  // Draft-with-Leo + voice check.
  const [assistOpen, setAssistOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  const [voice, setVoice] = useState<{
    verdict: string | null;
    summary: string;
    flags: { quote: string; issue: string }[];
  } | null>(null);

  useEffect(() => {
    if (!isCrmConfigured) return;
    crmSupabase
      .from("partners")
      .select("id, name")
      .order("name")
      .then(({ data }) =>
        setPartners(
          (data || []).map((p) => ({ id: p.id as string, name: p.name as string })),
        ),
      );
  }, []);

  const generate = async () => {
    if (!instruction.trim()) return;
    setGenerating(true);
    setAssistError(null);
    setResult(null);
    try {
      const r = await fetch("/api/sam/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instruction.trim(),
          content,
          audience: audience || undefined,
          partnerId: partnerId || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Draft failed");
      setResult(d.text || "");
    } catch (e) {
      setAssistError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setGenerating(false);
    }
  };

  const voiceCheck = async () => {
    if (!content.trim()) return;
    setChecking(true);
    setVoice(null);
    try {
      const r = await fetch("/api/sam/voice-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Check failed");
      setVoice(d);
    } catch (e) {
      setVoice({
        verdict: null,
        summary: e instanceof Error ? e.message : "Check failed",
        flags: [],
      });
    } finally {
      setChecking(false);
    }
  };

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
            onClick={() => {
              setAssistOpen((o) => !o);
              setResult(null);
              setAssistError(null);
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            <Sparkles size={15} />
            Draft with Leo
          </button>
          <button
            onClick={voiceCheck}
            disabled={checking || !content.trim()}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-50"
          >
            {checking ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ShieldCheck size={15} />
            )}
            Voice check
          </button>
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

      {/* Draft-with-Leo panel */}
      {assistOpen && (
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <Sparkles size={14} className="text-indigo-500" /> Draft with Leo
            </span>
            <button
              onClick={() => setAssistOpen(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            placeholder="What should Sam write? e.g. 'A LinkedIn post from these notes' or 'Tighten the opening and cut the jargon'."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
          />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {partners.length > 0 && (
              <select
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
              >
                <option value="">Ground with a partner… (optional)</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={generate}
              disabled={generating || !instruction.trim()}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {generating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {generating ? "Writing…" : "Generate"}
            </button>
          </div>
          {assistError && (
            <p className="text-sm text-red-600 mt-2">{assistError}</p>
          )}
          {result !== null && (
            <div className="mt-3">
              <div className="bg-white border border-slate-200 rounded-lg p-3 text-sm text-slate-800 whitespace-pre-wrap max-h-72 overflow-y-auto">
                {result}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => {
                    setContent(result);
                    setAssistOpen(false);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  Replace draft
                </button>
                <button
                  onClick={() => {
                    setContent((c) => (c.trim() ? `${c}\n\n${result}` : result));
                    setAssistOpen(false);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg"
                >
                  Append
                </button>
                <button
                  onClick={generate}
                  className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800"
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Voice check result */}
      {voice && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-500" /> Voice check
              {voice.verdict && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    voice.verdict === "on voice"
                      ? "bg-emerald-50 text-emerald-700"
                      : voice.verdict === "some drift"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                  }`}
                >
                  {voice.verdict}
                </span>
              )}
            </span>
            <button
              onClick={() => setVoice(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>
          <p className="text-sm text-slate-600">{voice.summary}</p>
          {voice.flags.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {voice.flags.map((f, i) => (
                <li key={i} className="text-sm">
                  <span className="text-slate-800">“{f.quote}”</span>
                  <span className="text-slate-500"> — {f.issue}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
