"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import {
  Mail as MailIcon,
  Search,
  Loader2,
  ArrowLeft,
  Archive,
  Send,
  PenSquare,
  X,
  RefreshCw,
  Sparkles,
  Plane,
  Check,
  ListTodo,
  BookOpen,
  Building2,
  ExternalLink,
} from "lucide-react";
import { Trip, loadTrips, attachEmailToTrip } from "@/lib/trips";
import { readJsonResponse } from "@/lib/http";
import { useApp } from "@/store/store";
import { Task, QuickTask } from "@/types";
import CharacterQuote from "./CharacterQuote";
import TemuTouchpointModal, {
  TemuTouchpointPreview,
} from "./TemuTouchpointModal";
import TemuPartnerPickerModal, {
  TemuPartnerSelection,
} from "./TemuPartnerPickerModal";

type Urgency = "now" | "question" | "later" | null;

interface ThreadSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  messageCount: number;
  urgency?: Urgency;
}

// Bucket accent colors for the view chips.
const VIEW_COLORS: Record<string, string> = {
  all: "bg-slate-600",
  current: "bg-emerald-500",
  potential: "bg-amber-500",
  willow: "bg-indigo-500",
  newsletter: "bg-slate-400",
  notifications: "bg-sky-500",
  other: "bg-slate-400",
};

const URGENCY: Record<
  Exclude<Urgency, null>,
  { emoji: string; label: string; cls: string }
> = {
  now: { emoji: "🔥", label: "Needs attention", cls: "" },
  question: { emoji: "❓", label: "Question", cls: "" },
  later: { emoji: "🕒", label: "Can wait", cls: "opacity-40" },
};

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-indigo-100 text-indigo-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-teal-100 text-teal-700",
];
function avatarFor(name: string): { initials: string; cls: string } {
  const clean = name.replace(/<.*>/, "").trim() || name;
  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = (
    (parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  return { initials: initials || "?", cls: AVATAR_COLORS[hash % AVATAR_COLORS.length] };
}
interface ThreadMessage {
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  cleanBody: string;
  hasQuotedContent: boolean;
  html: string;
}

// Renders untrusted email HTML inside a no-scripts sandboxed iframe so it
// looks like the real email but can't run code or leak CSS into Leo.
function EmailFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;font-size:14px;line-height:1.55;margin:0;padding:0;word-wrap:break-word;overflow-wrap:break-word;}img{max-width:100%;height:auto;}a{color:#4f46e5;}table{max-width:100%;}</style></head><body>${html}</body></html>`;
  const resize = () => {
    const f = ref.current;
    const b = f?.contentWindow?.document?.body;
    if (f && b) f.style.height = `${b.scrollHeight + 16}px`;
  };
  return (
    <iframe
      ref={ref}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      onLoad={() => {
        resize();
        // Re-measure after late image loads.
        setTimeout(resize, 600);
        setTimeout(resize, 1600);
      }}
      title="Email content"
      className="w-full"
      style={{ border: 0, width: "100%", minHeight: 60 }}
    />
  );
}

function ThreadMessageCard({ message }: { message: ThreadMessage }) {
  const [showQuoted, setShowQuoted] = useState(false);
  const cleanBody = message.cleanBody || message.body || message.snippet;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-slate-800">
          {senderName(message.from)}
        </span>
        <span className="text-xs text-slate-400">
          {message.date && format(new Date(message.date), "MMM d, h:mm a")}
        </span>
      </div>
      {showQuoted ? (
        message.html ? (
          <EmailFrame html={message.html} />
        ) : (
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            {message.body || message.snippet}
          </div>
        )
      ) : message.hasQuotedContent ? (
        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {cleanBody}
        </div>
      ) : message.html ? (
        <EmailFrame html={message.html} />
      ) : (
        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {cleanBody}
        </div>
      )}
      {message.hasQuotedContent && (
        <button
          type="button"
          onClick={() => setShowQuoted((current) => !current)}
          className="mt-3 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          {showQuoted ? "Hide quoted text" : "Show quoted text"}
        </button>
      )}
    </div>
  );
}
interface FullThread {
  id: string;
  messages: ThreadMessage[];
}

interface DraftSource {
  id: string;
  kind: "crm" | "granola" | "memory" | "past_email" | "drive" | "platform";
  title: string;
  detail: string;
  url?: string;
}

function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<.*>/);
  return (m ? m[1] : from.replace(/<.*>/, "")).trim() || from;
}
function fmtDate(d: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return format(dt, "MMM d");
}

export default function Mail() {
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("all");
  const [views, setViews] = useState<
    { key: string; label: string; unread: number }[]
  >([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedUrgency, setSelectedUrgency] = useState<Urgency>(null);
  const [thread, setThread] = useState<FullThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftSources, setDraftSources] = useState<DraftSource[]>([]);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // Grow the reply box to fit its content so a drafted email shows in full.
  useEffect(() => {
    const el = replyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [replyBody, selectedId]);
  const [composing, setComposing] = useState(false);
  const [tripMenuOpen, setTripMenuOpen] = useState(false);
  const [tripList, setTripList] = useState<Trip[]>([]);
  const [attachedTo, setAttachedTo] = useState<string | null>(null);

  const { dispatch } = useApp();
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDest, setTaskDest] = useState<"task" | "quick">("task");
  const [taskDue, setTaskDue] = useState("");
  const [taskCreated, setTaskCreated] = useState(false);
  const [temuPreview, setTemuPreview] =
    useState<TemuTouchpointPreview | null>(null);
  const [temuPartnerSelection, setTemuPartnerSelection] =
    useState<TemuPartnerSelection | null>(null);
  const [temuPartnerError, setTemuPartnerError] = useState<string | null>(null);
  const [temuPreviewing, setTemuPreviewing] = useState(false);

  const openTaskMenu = () => {
    setTaskTitle(thread?.messages[0]?.subject || "");
    setTaskDest("task");
    setTaskDue("");
    setTaskCreated(false);
    setTripMenuOpen(false);
    setTaskMenuOpen((o) => !o);
  };

  const createTaskFromEmail = () => {
    const title = taskTitle.trim();
    if (!title || !thread || !selectedId) return;
    const from = thread.messages[0]?.from || "";
    const origin = from ? ` (from ${senderName(from)})` : "";
    const gmailUrl = `https://mail.google.com/mail/u/0/#all/${selectedId}`;
    const now = new Date();
    if (taskDest === "task") {
      const task: Task = {
        id: crypto.randomUUID(),
        title,
        description: `From email${origin}`,
        priority: "medium",
        status: "pending",
        projectId: null,
        dueDate: taskDue ? new Date(`${taskDue}T12:00:00`) : undefined,
        createdAt: now,
        focusMinutes: 0,
        link: gmailUrl,
      };
      dispatch({ type: "ADD_TASK", payload: task });
    } else {
      const qt: QuickTask = {
        id: crypto.randomUUID(),
        task: title,
        dueDate: taskDue ? new Date(`${taskDue}T00:00:00`) : undefined,
        notes: `From email${origin}: ${gmailUrl}`,
        status: "not_started",
        displayOrder: 0,
        createdAt: now,
        updatedAt: now,
      };
      dispatch({ type: "ADD_QUICK_TASK", payload: qt });
    }
    setTaskCreated(true);
    setTimeout(() => setTaskMenuOpen(false), 1000);
  };

  const addToTrip = (trip: Trip) => {
    if (!thread || !selectedId) return;
    const m = thread.messages[0];
    attachEmailToTrip(trip.id, {
      threadId: selectedId,
      subject: m?.subject || "",
      from: m?.from || "",
      date: m?.date || "",
    });
    setAttachedTo(trip.id);
    setTimeout(() => setTripMenuOpen(false), 900);
  };

  const loadViews = useCallback(() => {
    fetch("/api/mail/views")
      .then((r) => r.json())
      .then((d) => {
        if (d.views) setViews(d.views);
      })
      .catch(() => {});
  }, []);

  const loadThreads = useCallback((view: string, q?: string) => {
    setLoadingList(true);
    setError(null);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    else params.set("view", view);
    fetch(`/api/mail/threads?${params}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load mail");
        return d;
      })
      .then((d) => setThreads(d.threads || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingList(false));
  }, []);

  // Silent background sort — refreshes the counters when done.
  const backgroundClassify = useCallback(async () => {
    try {
      const res = await fetch("/api/mail/classify", { method: "POST" });
      if (res.ok) loadViews();
    } catch {
      /* ignore */
    }
  }, [loadViews]);

  useEffect(() => {
    loadViews();
    loadThreads("all");
    // Sort on open, then quietly every few minutes while the inbox is open.
    backgroundClassify();
    const interval = setInterval(backgroundClassify, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadViews, loadThreads, backgroundClassify]);

  const selectView = (view: string) => {
    setActiveView(view);
    setSearch("");
    loadThreads(view);
  };

  const classify = async () => {
    setClassifying(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/classify", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Sort failed");
      loadViews();
      loadThreads(activeView);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sort failed");
    } finally {
      setClassifying(false);
    }
  };

  const openThread = (id: string) => {
    setSelectedId(id);
    setSelectedUrgency(threads.find((t) => t.id === id)?.urgency ?? null);
    setThread(null);
    setReplyBody("");
    setDraftSources([]);
    setTripMenuOpen(false);
    setAttachedTo(null);
    setLoadingThread(true);
    fetch(`/api/mail/thread?id=${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load thread");
        return d;
      })
      .then((d) => setThread(d.thread))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingThread(false));
  };

  const doAction = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/mail/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Action failed");
    return d;
  };

  const archive = async (id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (selectedId === id) setSelectedId(null);
    try {
      await doAction({ action: "archive", threadId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
      loadThreads(activeView);
    }
    loadViews();
  };

  const draftWithLeo = async () => {
    if (!selectedId) return;
    setDrafting(true);
    setError(null);
    setDraftSources([]);
    try {
      const res = await fetch("/api/mail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: selectedId,
          notes: replyBody.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Draft failed");
      setReplyBody(d.draft);
      setDraftSources(d.sources || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  };

  const sendReply = async () => {
    if (!replyBody.trim() || !selectedId) return;
    setSending(true);
    try {
      await doAction({ action: "reply", threadId: selectedId, body: replyBody.trim() });
      setReplyBody("");
      openThread(selectedId); // refresh thread
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const reviewTemuTouchpoint = async (partnerId?: string) => {
    if (!selectedId) return;
    setTemuPreviewing(true);
    setError(null);
    setTemuPartnerError(null);
    try {
      const response = await fetch("/api/temu/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "email",
          id: selectedId,
          partner_id: partnerId,
        }),
      });
      const body = await readJsonResponse<{
        error: string;
        preview: TemuTouchpointPreview;
        partner_selection: TemuPartnerSelection;
      }>(response);
      if (!response.ok) {
        throw new Error(body.error || `TEMU preview failed (${response.status})`);
      }
      if (body.partner_selection) {
        setTemuPartnerSelection(body.partner_selection);
        return;
      }
      if (!body.preview) throw new Error("TEMU preview returned no result");
      setTemuPartnerSelection(null);
      setTemuPreview(body.preview);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "TEMU preview failed";
      if (partnerId) setTemuPartnerError(message);
      else setError(message);
    } finally {
      setTemuPreviewing(false);
    }
  };

  /* ------------------------------- Read view ------------------------------ */
  if (selectedId) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setSelectedId(null)}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={16} />
            Inbox
          </button>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => {
                  setTripList(loadTrips());
                  setAttachedTo(null);
                  setTripMenuOpen((o) => !o);
                }}
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
              >
                <Plane size={15} />
                Add to trip
              </button>
              {tripMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 max-h-72 overflow-y-auto">
                  {tripList.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">
                      No trips yet — add one on the Travel page.
                    </div>
                  ) : (
                    tripList.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => addToTrip(t)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-slate-700">
                          {t.destination}
                        </span>
                        {attachedTo === t.id ? (
                          <Check size={15} className="text-green-600 flex-shrink-0" />
                        ) : (
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            {format(new Date(t.start), "MMM d")}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <button
                onClick={openTaskMenu}
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
              >
                <ListTodo size={15} />
                Add task
              </button>
              {taskMenuOpen && (
                <div className="absolute right-0 top-9 z-20 w-72 bg-white border border-slate-200 rounded-lg shadow-lg p-3 space-y-2">
                  {taskCreated ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700 py-2 px-1">
                      <Check size={15} /> Added to{" "}
                      {taskDest === "task" ? "Tasks" : "Quick Tasks"}
                    </div>
                  ) : (
                    <>
                      <input
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") createTaskFromEmail();
                        }}
                        placeholder="Task title"
                        className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={taskDest}
                          onChange={(e) =>
                            setTaskDest(e.target.value as "task" | "quick")
                          }
                          className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        >
                          <option value="task">Task</option>
                          <option value="quick">Quick task</option>
                        </select>
                        <input
                          type="date"
                          value={taskDue}
                          onChange={(e) => setTaskDue(e.target.value)}
                          className="flex-1 text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        />
                      </div>
                      <button
                        onClick={createTaskFromEmail}
                        disabled={!taskTitle.trim()}
                        className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md transition-colors"
                      >
                        <ListTodo size={14} />
                        Create
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => reviewTemuTouchpoint()}
              disabled={temuPreviewing || loadingThread}
              className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
              title="Review this email before adding it to TEMU"
            >
              {temuPreviewing ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Building2 size={15} />
              )}
              {temuPreviewing ? "Preparing…" : "TEMU touchpoint?"}
            </button>
            <button
              onClick={() => archive(selectedId)}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
            >
              <Archive size={15} />
              Archive
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loadingThread && (
          <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        )}

        {thread && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {selectedUrgency && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  <span>{URGENCY[selectedUrgency].emoji}</span>
                  {URGENCY[selectedUrgency].label}
                </span>
              )}
              <h1 className="text-xl font-bold text-slate-900">
                {thread.messages[0]?.subject || "(no subject)"}
              </h1>
            </div>
            <div className="space-y-3">
              {thread.messages.map((m, i) => (
                <ThreadMessageCard key={i} message={m} />
              ))}
            </div>

            {/* Reply box */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mt-4">
              <div className="text-xs text-slate-500 mb-2">
                Reply to {senderName(thread.messages[thread.messages.length - 1]?.from || "")}
              </div>
              <textarea
                ref={replyRef}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={4}
                placeholder="Write a reply, or jot a few notes and let Leo draft it in your voice…"
                className="w-full min-h-[6rem] border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none overflow-hidden"
              />
              {draftSources.length > 0 && (
                <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <BookOpen size={13} />
                    Sources Leo checked
                  </div>
                  <div className="space-y-1">
                    {draftSources.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-slate-700">
                            {source.title}
                          </span>
                          <span className="ml-1.5 text-slate-400">
                            {source.detail}
                          </span>
                        </div>
                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 text-emerald-600 hover:text-emerald-800"
                            title={`Open ${source.title}`}
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <button
                  onClick={draftWithLeo}
                  disabled={drafting || sending}
                  title="Leo drafts a reply in your voice. Add a few notes first to steer it."
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {drafting ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  {drafting
                    ? "Finding sources and drafting…"
                    : replyBody.trim()
                      ? "Draft from notes"
                      : "Draft with Leo"}
                </button>
                <button
                  onClick={sendReply}
                  disabled={sending || drafting || !replyBody.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {sending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Send size={15} />
                  )}
                  Send reply
                </button>
              </div>
            </div>
          </>
        )}
        {temuPreview && (
          <TemuTouchpointModal
            preview={temuPreview}
            onClose={() => setTemuPreview(null)}
          />
        )}
        {temuPartnerSelection && (
          <TemuPartnerPickerModal
            selection={temuPartnerSelection}
            loading={temuPreviewing}
            error={temuPartnerError}
            onSelect={reviewTemuTouchpoint}
            onClose={() => {
              setTemuPartnerSelection(null);
              setTemuPartnerError(null);
            }}
          />
        )}
      </div>
    );
  }

  /* ------------------------------- List view ------------------------------ */
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-rose-50 rounded-xl flex items-center justify-center">
            <MailIcon className="text-rose-500" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Donna</h1>
            <CharacterQuote character="donna" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={classify}
            disabled={classifying}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-60 rounded-lg transition-colors"
            title="Sort the inbox into buckets"
          >
            {classifying ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Sparkles size={15} />
            )}
            Sort inbox
          </button>
          <button
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <PenSquare size={16} />
            Compose
          </button>
        </div>
      </div>

      {/* View chips with unread counters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {views.map((v) => {
          const color = VIEW_COLORS[v.key] || "bg-slate-400";
          const active = activeView === v.key && !search;
          return (
            <button
              key={v.key}
              onClick={() => selectView(v.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                active
                  ? "border-slate-300 bg-white text-slate-900 shadow-sm"
                  : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${color}`} />
              {v.label}
              {v.unread > 0 && (
                <span
                  className={`text-xs font-semibold rounded-full px-1.5 min-w-[18px] text-center text-white ${color}`}
                >
                  {v.unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          loadThreads(activeView, search.trim() || undefined);
        }}
        className="flex items-center gap-2"
      >
        <div className="flex-1 relative">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mail (e.g. from:rasha, is:unread)…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="button"
          onClick={() => loadThreads(activeView, search.trim() || undefined)}
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loadingList ? (
        <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading inbox…
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center text-slate-400 py-10 text-sm">
          Nothing here.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
          {threads.map((t) => {
            const av = avatarFor(t.from);
            const u = t.urgency ? URGENCY[t.urgency] : null;
            return (
              <div
                key={t.id}
                className={`flex items-stretch gap-3 pr-4 py-3 cursor-pointer group transition-colors hover:bg-slate-50 ${
                  t.unread ? "bg-indigo-50/40" : ""
                }`}
                onClick={() => openThread(t.id)}
              >
                <div
                  className={`w-1 rounded-r-full ${
                    t.unread ? "bg-indigo-500" : "bg-transparent"
                  }`}
                />
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 self-center ${av.cls}`}
                >
                  {av.initials}
                </div>
                <div className="flex-1 min-w-0 self-center">
                  <div className="flex items-center gap-1.5">
                    {u && (
                      <span title={u.label} className={`text-sm leading-none ${u.cls}`}>
                        {u.emoji}
                      </span>
                    )}
                    <span
                      className={`text-sm truncate ${
                        t.unread
                          ? "font-semibold text-slate-900"
                          : "text-slate-700"
                      }`}
                    >
                      {senderName(t.from)}
                    </span>
                    {t.messageCount > 1 && (
                      <span className="text-xs text-slate-400">
                        {t.messageCount}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-sm truncate ${
                      t.unread ? "font-medium text-slate-800" : "text-slate-600"
                    }`}
                  >
                    {t.subject || "(no subject)"}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {t.snippet}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0 self-center">
                  <span className="text-xs text-slate-400">
                    {fmtDate(t.date)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      archive(t.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-600 transition-all"
                    title="Archive"
                  >
                    <Archive size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {composing && (
        <ComposeModal
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            loadThreads(activeView);
            loadViews();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------ Compose modal ----------------------------- */

function ComposeModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Grow the message box to fit its content so a drafted email shows in full.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  const draftWithLeo = async () => {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim() || undefined,
          subject: subject.trim() || undefined,
          notes: body.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Draft failed");
      setBody(d.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  };

  const send = async () => {
    if (!to.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          to: to.trim(),
          subject: subject.trim() || "(no subject)",
          body: body.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Send failed");
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">New message</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="To"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Write your message, or jot a few notes and let Leo draft it in your voice…"
            className="w-full min-h-[12rem] max-h-[60vh] overflow-y-auto border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 p-5 border-t border-slate-100">
          <button
            onClick={draftWithLeo}
            disabled={drafting || sending || (!body.trim() && !subject.trim())}
            title="Leo drafts the email in your voice. Add a subject or a few notes to steer it."
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 rounded-lg transition-colors"
          >
            {drafting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Sparkles size={15} />
            )}
            {drafting
              ? "Drafting…"
              : body.trim()
                ? "Draft from notes"
                : "Draft with Leo"}
          </button>
          <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending || !to.trim() || !body.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
