"use client";

import React, { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";

interface ThreadSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  messageCount: number;
}
interface ThreadMessage {
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}
interface FullThread {
  id: string;
  messages: ThreadMessage[];
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
  const [thread, setThread] = useState<FullThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [composing, setComposing] = useState(false);

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

  useEffect(() => {
    loadViews();
    loadThreads("all");
  }, [loadViews, loadThreads]);

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
    setThread(null);
    setReplyBody("");
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
          <button
            onClick={() => archive(selectedId)}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            <Archive size={15} />
            Archive
          </button>
        </div>

        {loadingThread && (
          <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        )}

        {thread && (
          <>
            <h1 className="text-xl font-bold text-slate-900 mb-4">
              {thread.messages[0]?.subject || "(no subject)"}
            </h1>
            <div className="space-y-3">
              {thread.messages.map((m, i) => (
                <div
                  key={i}
                  className="bg-white border border-slate-200 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-slate-800">
                      {senderName(m.from)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {m.date && format(new Date(m.date), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {m.body || m.snippet}
                  </div>
                </div>
              ))}
            </div>

            {/* Reply box */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mt-4">
              <div className="text-xs text-slate-500 mb-2">
                Reply to {senderName(thread.messages[thread.messages.length - 1]?.from || "")}
              </div>
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={4}
                placeholder="Write a reply…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={sendReply}
                  disabled={sending || !replyBody.trim()}
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
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          </>
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
            <p className="text-slate-500 text-sm">Your inbox, inside Leo.</p>
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
        {views.map((v) => (
          <button
            key={v.key}
            onClick={() => selectView(v.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
              activeView === v.key && !search
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {v.label}
            {v.unread > 0 && (
              <span
                className={`text-xs font-semibold rounded-full px-1.5 min-w-[18px] text-center ${
                  activeView === v.key && !search
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {v.unread}
              </span>
            )}
          </button>
        ))}
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
          {threads.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer group"
              onClick={() => openThread(t.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm truncate ${
                      t.unread ? "font-semibold text-slate-900" : "text-slate-700"
                    }`}
                  >
                    {senderName(t.from)}
                  </span>
                  {t.messageCount > 1 && (
                    <span className="text-xs text-slate-400">
                      {t.messageCount}
                    </span>
                  )}
                  {t.unread && (
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full flex-shrink-0" />
                  )}
                </div>
                <div
                  className={`text-sm truncate ${
                    t.unread ? "font-medium text-slate-800" : "text-slate-600"
                  }`}
                >
                  {t.subject || "(no subject)"}
                </div>
                <div className="text-xs text-slate-400 truncate">{t.snippet}</div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-xs text-slate-400">{fmtDate(t.date)}</span>
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
          ))}
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
  const [error, setError] = useState<string | null>(null);

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
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Write your message…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-100">
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
  );
}
