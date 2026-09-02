"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

type Urgency = "now" | "question" | "later" | null;
type Destination = "task" | "quick_task" | "backlog";

interface MailThread {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  urgency?: Urgency;
}

interface ExtractedTask {
  id: string;
  task: string;
  due_date: string | null;
  partner_id: string | null;
  partner_name: string | null;
  source_quote: string | null;
  status: "pending" | "confirmed" | "dismissed";
  suggested_destination: Destination | "note" | "ignore" | null;
}

interface Meeting {
  id: string;
  title: string;
  meeting_date: string | null;
  synced_at: string | null;
  tasks: ExtractedTask[];
}

interface TaskDraft {
  task: string;
  dueDate: string;
  destination: Destination;
  keepPartner: boolean;
}

const DESTINATIONS: { value: Destination; label: string }[] = [
  { value: "task", label: "Task" },
  { value: "quick_task", label: "Quick task" },
  { value: "backlog", label: "Backlog" },
];

function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return (match ? match[1] : from.replace(/<.*>/, "")).trim() || from;
}

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestImport(meetings: Meeting[]): Date | null {
  return meetings.reduce<Date | null>((latest, meeting) => {
    const synced = safeDate(meeting.synced_at);
    if (!synced) return latest;
    return !latest || synced > latest ? synced : latest;
  }, null);
}

function sourceHref(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

export default function AttentionHub() {
  const [mail, setMail] = useState<MailThread[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TaskDraft>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const seedDrafts = useCallback((nextMeetings: Meeting[]) => {
    setDrafts((current) => {
      const next = { ...current };
      for (const meeting of nextMeetings) {
        for (const task of meeting.tasks) {
          if (task.status !== "pending" || next[task.id]) continue;
          const suggested = task.suggested_destination;
          next[task.id] = {
            task: task.task,
            dueDate: task.due_date || "",
            destination:
              suggested === "quick_task" || suggested === "backlog"
                ? suggested
                : "task",
            keepPartner: true,
          };
        }
      }
      return next;
    });
  }, []);

  const loadSources = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoading(true);
      const [mailResult, meetingResult] = await Promise.allSettled([
        fetch("/api/mail/threads?view=all").then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Email is unavailable");
          return data as { threads?: MailThread[] };
        }),
        fetch("/api/granola/meetings").then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Granola is unavailable");
          return data as { meetings?: Meeting[] };
        }),
      ]);

      const errors: string[] = [];
      if (mailResult.status === "fulfilled") {
        setMail(mailResult.value.threads ?? []);
      } else {
        errors.push("Email");
      }
      if (meetingResult.status === "fulfilled") {
        const nextMeetings = meetingResult.value.meetings ?? [];
        setMeetings(nextMeetings);
        seedDrafts(nextMeetings);
      } else {
        errors.push("Granola");
      }
      setSourceErrors(errors);
      setLoading(false);
    },
    [seedDrafts],
  );

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const pendingMeetings = useMemo(
    () =>
      meetings
        .map((meeting) => ({
          ...meeting,
          pendingTasks: meeting.tasks.filter((task) => task.status === "pending"),
        }))
        .filter((meeting) => meeting.pendingTasks.length > 0),
    [meetings],
  );

  const urgentMail = mail.filter(
    (thread) => thread.unread && thread.urgency === "now",
  );
  const quickMail = mail.filter(
    (thread) => thread.unread && thread.urgency === "question",
  );
  const watchMail = mail.filter(
    (thread) => thread.unread && thread.urgency === "later",
  );
  const pendingCommitments = pendingMeetings.reduce(
    (total, meeting) => total + meeting.pendingTasks.length,
    0,
  );
  const reviewCount = urgentMail.length + quickMail.length + pendingCommitments;
  const importedAt = latestImport(meetings);

  const setDraft = (id: string, patch: Partial<TaskDraft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  };

  const removeCandidate = (meetingId: string, taskId: string) => {
    setMeetings((current) =>
      current.map((meeting) =>
        meeting.id === meetingId
          ? {
              ...meeting,
              tasks: meeting.tasks.filter((task) => task.id !== taskId),
            }
          : meeting,
      ),
    );
    window.dispatchEvent(new Event("leo:attention-updated"));
  };

  const routeTask = async (meeting: Meeting, task: ExtractedTask) => {
    const draft = drafts[task.id];
    if (!draft?.task.trim()) return;
    setBusy((current) => new Set(current).add(task.id));
    setReceipt(null);
    try {
      const response = await fetch("/api/granola/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          action: "route",
          destination: draft.destination,
          task: draft.task.trim(),
          due_date: draft.dueDate || null,
          partner_id:
            draft.destination === "task" && draft.keepPartner
              ? task.partner_id
              : null,
          partner_name:
            draft.destination === "task" && draft.keepPartner
              ? task.partner_name
              : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create item");
      removeCandidate(meeting.id, task.id);
      const destination =
        data.routedTo === "crm"
          ? `${task.partner_name || "partner"} CRM`
          : data.routedTo === "quick_task"
            ? "Quick Tasks"
            : data.routedTo === "backlog"
              ? "Backlog"
              : "Tasks";
      setReceipt(`Created “${draft.task.trim()}” in ${destination}.`);
    } catch (error) {
      setSourceErrors([
        error instanceof Error ? error.message : "Could not create item",
      ]);
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  };

  const dismissTask = async (meeting: Meeting, task: ExtractedTask) => {
    setBusy((current) => new Set(current).add(task.id));
    setReceipt(null);
    try {
      const response = await fetch("/api/granola/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, action: "dismiss" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not dismiss item");
      removeCandidate(meeting.id, task.id);
      setReceipt("Dismissed. Leo will not create that task.");
    } catch (error) {
      setSourceErrors([
        error instanceof Error ? error.message : "Could not dismiss item",
      ]);
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  };

  const syncGranola = async () => {
    setSyncing(true);
    setReceipt(null);
    try {
      const response = await fetch("/api/granola/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Granola sync failed");
      setLastCheckedAt(new Date());
      await loadSources(false);
      setReceipt(
        data.tasksFound > 0
          ? `Granola checked. ${data.tasksFound} new commitment${data.tasksFound === 1 ? "" : "s"} ready to review.`
          : "Granola checked. No new commitments found.",
      );
    } catch (error) {
      setSourceErrors([
        error instanceof Error ? error.message : "Granola sync failed",
      ]);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Attention</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            What needs you—not just what is new
          </h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Review Leo&rsquo;s proposals here. Nothing becomes a task or gets sent
            without your action.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-right shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {lastCheckedAt ? "Granola checked" : "Latest Granola import"}
            </p>
            <p className="text-sm font-semibold text-slate-700">
              {lastCheckedAt
                ? formatDistanceToNow(lastCheckedAt, { addSuffix: true })
                : importedAt
                  ? formatDistanceToNow(importedAt, { addSuffix: true })
                  : "No import yet"}
            </p>
          </div>
          <button
            onClick={syncGranola}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {syncing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            {syncing ? "Checking…" : "Sync now"}
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-2xl font-bold text-slate-950">
            {loading ? "—" : reviewCount}
          </p>
          <p className="text-sm text-slate-500">items waiting for your judgment</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-700">
            {urgentMail.length} critical
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">
            {pendingCommitments} meeting commitments
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
            {quickMail.length} quick responses
          </span>
        </div>
      </section>

      {sourceErrors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {sourceErrors.join(" · ")}. Leo will show what it can without guessing.
        </div>
      )}

      {receipt && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={17} />
          {receipt}
        </div>
      )}

      {urgentMail.length > 0 && (
        <section id="critical" className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-rose-500" />
            <h2 className="font-semibold text-slate-900">Needs you now</h2>
          </div>
          {urgentMail.map((thread) => (
            <article
              id={`email-${thread.id}`}
              key={thread.id}
              className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-600">
                    <span className="rounded-full bg-rose-50 px-2 py-1">Email · critical</span>
                    <span className="normal-case font-normal text-slate-400">
                      {senderName(thread.from)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-900">
                    {thread.subject || "No subject"}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                    {thread.snippet}
                  </p>
                </div>
                <a
                  href={sourceHref(thread.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  Review email <ExternalLink size={14} />
                </a>
              </div>
            </article>
          ))}
        </section>
      )}

      {pendingMeetings.length > 0 && (
        <section id="meeting-follow-up" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareText size={18} className="text-amber-500" />
              <h2 className="font-semibold text-slate-900">Meeting follow-up</h2>
            </div>
            <a href="/meetings" className="text-xs font-semibold text-indigo-600 hover:underline">
              Browse every meeting →
            </a>
          </div>

          {pendingMeetings.map((meeting) => {
            const meetingDate = safeDate(meeting.meeting_date);
            return (
              <article
                id={`meeting-${meeting.id}`}
                key={meeting.id}
                className="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-amber-100 bg-amber-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{meeting.title}</h3>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700 shadow-sm">
                        {meeting.pendingTasks.length} proposed
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {meetingDate
                        ? format(meetingDate, "EEE, MMM d · h:mm a")
                        : "Meeting date unavailable"}
                    </p>
                  </div>
                  <a
                    href="/meetings"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    <FileText size={13} /> Summary and transcript
                  </a>
                </div>

                <div className="space-y-4 p-5">
                  {meeting.pendingTasks.map((task) => {
                    const draft = drafts[task.id];
                    if (!draft) return null;
                    const isBusy = busy.has(task.id);
                    const routesToCrm =
                      draft.destination === "task" &&
                      draft.keepPartner &&
                      task.partner_id;
                    return (
                      <div key={task.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                            <Sparkles size={11} /> Proposed
                          </span>
                          {routesToCrm && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                              <Building2 size={12} /> {task.partner_name} CRM
                            </span>
                          )}
                        </div>

                        <label className="mt-3 block text-xs font-medium text-slate-500">
                          Proposed commitment
                        </label>
                        <input
                          value={draft.task}
                          onChange={(event) =>
                            setDraft(task.id, { task: event.target.value })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                        />

                        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
                          <span className="font-semibold text-slate-600">
                            Source: Granola Next Steps.
                          </span>{" "}
                          {task.source_quote
                            ? `Supporting detail: “${task.source_quote}”`
                            : "Open the meeting summary to verify the surrounding context."}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <select
                            value={draft.destination}
                            onChange={(event) =>
                              setDraft(task.id, {
                                destination: event.target.value as Destination,
                              })
                            }
                            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          >
                            {DESTINATIONS.map((destination) => (
                              <option key={destination.value} value={destination.value}>
                                {destination.label}
                              </option>
                            ))}
                          </select>
                          {draft.destination !== "backlog" && (
                            <input
                              type="date"
                              value={draft.dueDate}
                              onChange={(event) =>
                                setDraft(task.id, { dueDate: event.target.value })
                              }
                              aria-label="Due date"
                              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                          )}
                          {task.partner_id && draft.destination === "task" && (
                            <button
                              onClick={() =>
                                setDraft(task.id, {
                                  keepPartner: !draft.keepPartner,
                                })
                              }
                              className={`rounded-md border px-2 py-1.5 text-xs font-medium ${
                                draft.keepPartner
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-white text-slate-500"
                              }`}
                            >
                              {draft.keepPartner
                                ? `${task.partner_name} · wrong partner?`
                                : "No partner · restore"}
                            </button>
                          )}
                          <div className="ml-auto flex items-center gap-2">
                            <button
                              onClick={() => dismissTask(meeting, task)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                            >
                              <X size={13} /> Not mine
                            </button>
                            <button
                              onClick={() => routeTask(meeting, task)}
                              disabled={isBusy || !draft.task.trim()}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Check size={13} />
                              )}
                              Create
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex justify-end">
                    <a
                      href="/meetings"
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Leo missed something? Add it from the full meeting →
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {quickMail.length > 0 && (
        <section id="quick-responses" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail size={18} className="text-emerald-500" />
              <h2 className="font-semibold text-slate-900">Quick responses</h2>
            </div>
            <span className="text-xs text-slate-400">Ready for your next response window</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {quickMail.map((thread) => (
              <a
                id={`email-${thread.id}`}
                key={thread.id}
                href={sourceHref(thread.id)}
                target="_blank"
                rel="noreferrer"
                className="group rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm hover:border-emerald-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-emerald-700">
                      {senderName(thread.from)}
                    </p>
                    <h3 className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {thread.subject || "No subject"}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {thread.snippet}
                    </p>
                  </div>
                  <ArrowRight
                    size={15}
                    className="mt-1 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-emerald-500"
                  />
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {watchMail.length > 0 && (
        <section id="watch" className="rounded-2xl border border-sky-100 bg-sky-50/50 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock3 size={17} className="text-sky-500" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Watch</h2>
                <p className="text-xs text-slate-500">
                  {watchMail.length} unread message{watchMail.length === 1 ? "" : "s"} can wait.
                </p>
              </div>
            </div>
            <a href="/mail" className="text-xs font-semibold text-sky-700 hover:underline">
              Review later →
            </a>
          </div>
        </section>
      )}

      {!loading &&
        reviewCount === 0 &&
        watchMail.length === 0 &&
        sourceErrors.length === 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-slate-600 shadow-sm">
            <CheckCircle2 size={20} className="text-emerald-500" />
            Nothing currently needs your attention.
          </div>
        )}
    </div>
  );
}
