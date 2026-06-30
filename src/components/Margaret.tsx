"use client";

import React, { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  RefreshCw,
  Loader2,
  Check,
  X,
  Users,
  Calendar,
  FileText,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Building2,
  ListTodo,
} from "lucide-react";

const mdComponents = {
  p: (p: any) => <p className="mb-2 last:mb-0" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1" {...p} />,
  li: (p: any) => <li className="leading-snug" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-slate-900" {...p} />,
  h1: (p: any) => <h1 className="text-sm font-bold mt-3 mb-1" {...p} />,
  h2: (p: any) => <h2 className="text-sm font-bold mt-3 mb-1" {...p} />,
  h3: (p: any) => <h3 className="text-sm font-semibold mt-2 mb-1" {...p} />,
};

interface ExtractedTask {
  id: string;
  task: string;
  due_date: string | null;
  partner_id: string | null;
  partner_name: string | null;
  source_quote: string | null;
  status: "pending" | "confirmed" | "dismissed";
  routed_to: "crm" | "dashboard" | null;
}

interface Meeting {
  id: string;
  title: string;
  meeting_date: string | null;
  attendees: { name: string; email?: string }[];
  summary: string;
  owner_name: string;
  tasks: ExtractedTask[];
}

export default function Margaret() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [openSummary, setOpenSummary] = useState<Set<string>>(new Set());
  const [transcript, setTranscript] = useState<{
    title: string;
    text: string;
  } | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [partnerFilter, setPartnerFilter] = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/granola/meetings")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load meetings");
        return d;
      })
      .then((d) => setMeetings(d.meetings || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const r = await fetch("/api/granola/sync", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sync failed");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const act = async (
    meetingId: string,
    task: ExtractedTask,
    action: "confirm" | "dismiss",
  ) => {
    setBusy((b) => new Set(b).add(task.id));
    try {
      const r = await fetch("/api/granola/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, action }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Action failed");
      setMeetings((prev) =>
        prev.map((m) =>
          m.id !== meetingId
            ? m
            : {
                ...m,
                tasks: m.tasks.map((t) =>
                  t.id !== task.id
                    ? t
                    : {
                        ...t,
                        status: action === "confirm" ? "confirmed" : "dismissed",
                        routed_to: action === "confirm" ? d.routedTo : null,
                      },
                ),
              },
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(task.id);
        return n;
      });
    }
  };

  const openTranscript = async (m: Meeting) => {
    setLoadingTranscript(true);
    setTranscript({ title: m.title, text: "" });
    try {
      const r = await fetch(`/api/granola/meetings/${m.id}`);
      const d = await r.json();
      setTranscript({ title: m.title, text: d.transcript || "(no transcript)" });
    } catch {
      setTranscript({ title: m.title, text: "(failed to load transcript)" });
    } finally {
      setLoadingTranscript(false);
    }
  };

  const toggleSummary = (id: string) =>
    setOpenSummary((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const pendingCount = meetings.reduce(
    (n, m) => n + m.tasks.filter((t) => t.status === "pending").length,
    0,
  );

  const partnerOptions = Array.from(
    new Set(
      meetings.flatMap((m) =>
        m.tasks.map((t) => t.partner_name).filter((p): p is string => !!p),
      ),
    ),
  ).sort();

  const visibleMeetings =
    partnerFilter === "all"
      ? meetings
      : meetings.filter((m) =>
          m.tasks.some((t) => t.partner_name === partnerFilter),
        );

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Tell me what you know.
          </h1>
          <p className="text-slate-500 mt-1">
            Margaret reads your Granola meetings and pulls out what you said
            you&rsquo;d do.{" "}
            {pendingCount > 0 && (
              <span className="font-medium text-indigo-600">
                {pendingCount} commitment{pendingCount === 1 ? "" : "s"} to
                review.
              </span>
            )}
          </p>
        </div>
        <button
          onClick={sync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 rounded-lg transition-colors"
        >
          {syncing ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {partnerOptions.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={14} className="text-slate-400" />
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="all">All meetings</option>
            {partnerOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 mb-4 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 size={18} className="animate-spin" /> Loading meetings…
        </div>
      ) : meetings.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-500">
          No meetings yet. Click <strong>Sync now</strong> to pull from Granola.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleMeetings.map((m) => {
            const pending = m.tasks.filter((t) => t.status === "pending");
            const partner = m.tasks.find((t) => t.partner_name)?.partner_name;
            return (
              <div
                key={m.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"
              >
                {/* Meeting header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-900 truncate">
                      {m.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                      {m.meeting_date && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={12} />
                          {format(new Date(m.meeting_date), "EEE, MMM d · h:mm a")}
                        </span>
                      )}
                      {m.attendees?.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} />
                          {m.attendees.map((a) => a.name).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  {partner && (
                    <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                      <Building2 size={11} />
                      {partner}
                    </span>
                  )}
                </div>

                {/* Tasks */}
                {m.tasks.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {m.tasks.map((t) => {
                      const isBusy = busy.has(t.id);
                      if (t.status === "dismissed") {
                        return (
                          <div
                            key={t.id}
                            className="flex items-center gap-2 text-sm text-slate-400 line-through px-3 py-2"
                          >
                            <X size={14} className="flex-shrink-0" />
                            <span className="truncate">{t.task}</span>
                          </div>
                        );
                      }
                      if (t.status === "confirmed") {
                        return (
                          <div
                            key={t.id}
                            className="flex items-center gap-2 text-sm px-3 py-2 bg-emerald-50/60 rounded-lg"
                          >
                            <CheckCircle2
                              size={15}
                              className="text-emerald-500 flex-shrink-0"
                            />
                            <span className="flex-1 text-slate-700">{t.task}</span>
                            <span className="text-xs text-emerald-700 inline-flex items-center gap-1 flex-shrink-0">
                              {t.routed_to === "crm" ? (
                                <>
                                  <Building2 size={11} /> Added to CRM
                                </>
                              ) : (
                                <>
                                  <ListTodo size={11} /> Added to Tasks
                                </>
                              )}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={t.id}
                          className="flex items-start gap-2 px-3 py-2.5 bg-slate-50 rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-800">{t.task}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                              {t.due_date && (
                                <span className="text-xs text-amber-700">
                                  Due {format(new Date(t.due_date), "MMM d")}
                                </span>
                              )}
                              <span className="text-xs text-slate-400">
                                →{" "}
                                {t.partner_id
                                  ? `${t.partner_name} (CRM)`
                                  : "your tasks"}
                              </span>
                            </div>
                            {t.source_quote && (
                              <p className="text-xs text-slate-400 italic mt-1 truncate">
                                “{t.source_quote}”
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => act(m.id, t, "confirm")}
                              disabled={isBusy}
                              title="Confirm — add this task"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-md disabled:opacity-50 transition-colors"
                            >
                              {isBusy ? (
                                <Loader2 size={15} className="animate-spin" />
                              ) : (
                                <Check size={15} />
                              )}
                            </button>
                            <button
                              onClick={() => act(m.id, t, "dismiss")}
                              disabled={isBusy}
                              title="Dismiss"
                              className="p-1.5 text-slate-400 hover:bg-slate-200 rounded-md disabled:opacity-50 transition-colors"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer actions */}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 text-xs">
                  {m.summary && (
                    <button
                      onClick={() => toggleSummary(m.id)}
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                    >
                      {openSummary.has(m.id) ? (
                        <ChevronDown size={13} />
                      ) : (
                        <ChevronRight size={13} />
                      )}
                      Summary
                    </button>
                  )}
                  <button
                    onClick={() => openTranscript(m)}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                  >
                    <FileText size={13} />
                    Transcript
                  </button>
                  {m.tasks.length === 0 && (
                    <span className="text-slate-400">No commitments found</span>
                  )}
                </div>

                {openSummary.has(m.id) && m.summary && (
                  <div className="mt-3 text-sm text-slate-700 bg-slate-50 rounded-lg p-4 prose-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                      {m.summary}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Transcript modal */}
      {transcript && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={() => setTranscript(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 truncate">
                {transcript.title}
              </h2>
              <button
                onClick={() => setTranscript(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              {loadingTranscript ? (
                <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
                  <Loader2 size={16} className="animate-spin" /> Loading…
                </div>
              ) : (
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {transcript.text}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
