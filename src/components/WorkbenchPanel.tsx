"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Save,
  Search,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { WorkbenchRevisionOptions } from "@/lib/workbench-client";
import { WorkRun, WorkSource, workSourceKey } from "@/lib/workbench";

interface WorkbenchPanelProps {
  runs: WorkRun[];
  loading: boolean;
  configured: boolean | null;
  onRefresh: () => Promise<void>;
  onRevise: (
    taskId: string,
    options?: WorkbenchRevisionOptions,
  ) => Promise<void>;
}

const STATUS_LABELS: Record<WorkRun["status"], string> = {
  researching: "Researching",
  needs_input: "Needs your input",
  draft_ready: "Draft ready",
  reviewed: "Reviewed",
  failed: "Could not prepare",
  human_only: "Your move",
};

const STATUS_STYLES: Record<WorkRun["status"], string> = {
  researching: "bg-violet-50 text-violet-700",
  needs_input: "bg-amber-50 text-amber-800",
  draft_ready: "bg-emerald-50 text-emerald-700",
  reviewed: "bg-slate-100 text-slate-600",
  failed: "bg-red-50 text-red-700",
  human_only: "bg-slate-100 text-slate-600",
};

export default function WorkbenchPanel({
  runs,
  loading,
  configured,
  onRefresh,
  onRevise,
}: WorkbenchPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [rememberPreference, setRememberPreference] = useState<
    Record<string, boolean>
  >({});
  const [sourceFeedback, setSourceFeedback] = useState<
    Record<string, Record<string, NonNullable<WorkSource["feedback"]>>>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      runs.forEach((run) => {
        if (next[run.id] === undefined) next[run.id] = run.draft ?? "";
      });
      return next;
    });
  }, [runs]);

  useEffect(() => {
    setSourceFeedback((current) => {
      const next = { ...current };
      runs.forEach((run) => {
        if (next[run.id]) return;
        next[run.id] = Object.fromEntries(
          run.sources
            .filter(
              (source): source is WorkSource & {
                feedback: NonNullable<WorkSource["feedback"]>;
              } => Boolean(source.feedback),
            )
            .map((source) => [workSourceKey(source), source.feedback]),
        );
      });
      return next;
    });
  }, [runs]);

  const visibleRuns = useMemo(
    () =>
      runs
        .filter((run) => run.status !== "reviewed")
        .sort((a, b) => {
          const rank: Record<WorkRun["status"], number> = {
            needs_input: 0,
            draft_ready: 1,
            researching: 2,
            failed: 3,
            human_only: 4,
            reviewed: 5,
          };
          return rank[a.status] - rank[b.status];
        })
        .slice(0, 10),
    [runs],
  );

  const saveRun = async (run: WorkRun, reviewed: boolean) => {
    setSavingId(run.id);
    setError(null);
    try {
      const response = await fetch("/api/workbench/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: run.id,
          draft: drafts[run.id] ?? run.draft ?? "",
          status: reviewed ? "reviewed" : run.status,
        }),
      });
      const raw = await response.text();
      const data = raw ? (JSON.parse(raw) as { error?: string }) : {};
      if (!response.ok) throw new Error(data.error || "Could not save Leo's work");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save Leo's work");
    } finally {
      setSavingId(null);
    }
  };

  const revise = async (
    run: WorkRun,
    options: { researchAgain?: boolean; includeFeedback?: boolean } = {},
  ) => {
    setRetryingId(run.id);
    setError(null);
    try {
      await onRevise(run.taskId, {
        feedback: options.includeFeedback ? feedback[run.id]?.trim() : undefined,
        researchAgain: options.researchAgain ?? false,
        rememberPreference:
          options.includeFeedback && rememberPreference[run.id] === true,
        sourceFeedback: sourceFeedback[run.id] ?? {},
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[run.id];
        return next;
      });
      if (options.includeFeedback) {
        setFeedback((current) => ({ ...current, [run.id]: "" }));
        setRememberPreference((current) => ({
          ...current,
          [run.id]: false,
        }));
      }
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Leo could not try again");
    } finally {
      setRetryingId(null);
    }
  };

  const rateSource = (
    runId: string,
    source: WorkSource,
    rating: NonNullable<WorkSource["feedback"]>,
  ) => {
    const key = workSourceKey(source);
    setSourceFeedback((current) => {
      const existing = current[runId] ?? {};
      const next = { ...existing };
      if (next[key] === rating) delete next[key];
      else next[key] = rating;
      return { ...current, [runId]: next };
    });
  };

  if (configured === false) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <CircleHelp className="mt-0.5 text-amber-700" size={19} />
          <div>
            <h2 className="font-semibold text-amber-950">Workbench setup needed</h2>
            <p className="mt-1 text-sm text-amber-800">
              Apply <code>work-runs.sql</code> to Leo&apos;s Supabase project. No task or
              external system has been changed.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (loading && runs.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-white p-5 text-sm text-slate-500">
        <LoaderCircle className="animate-spin text-violet-500" size={18} />
        Loading Leo&apos;s workbench…
      </section>
    );
  }

  if (visibleRuns.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-violet-100 bg-violet-50/60 px-5 py-4">
        <span className="rounded-xl bg-white p-2 text-violet-600 shadow-sm">
          <Bot size={18} />
        </span>
        <div className="flex-1">
          <h2 className="font-semibold text-slate-900">Leo workbench</h2>
          <p className="text-xs text-slate-500">
            Provisional work for you to review. Nothing here has been sent or published.
          </p>
        </div>
        <button
          onClick={() => void onRefresh()}
          className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="divide-y divide-slate-100">
        {visibleRuns.map((run) => (
          <details key={run.id} className="group">
            <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 hover:bg-slate-50">
              <ChevronDown
                size={17}
                className="mt-0.5 flex-shrink-0 text-slate-400 transition-transform group-open:rotate-180"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{run.taskTitle}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[run.status]}`}
                  >
                    {STATUS_LABELS[run.status]}
                  </span>
                  {run.notificationTier !== "none" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <Bell size={11} />
                      {run.notificationTier === "immediate" ? "Alert" : "Next summary"}
                    </span>
                  )}
                </div>
                {run.rationale && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{run.rationale}</p>
                )}
              </div>
            </summary>

            <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 px-5 py-5">
              {run.status === "researching" && (
                <p className="flex items-center gap-2 text-sm text-violet-700">
                  <LoaderCircle size={16} className="animate-spin" />
                  Leo is finding context and deciding how far it can safely go.
                </p>
              )}

              {run.blockingQuestion && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    One thing Leo needs
                  </p>
                  <p className="mt-2 text-sm font-medium text-amber-950">
                    {run.blockingQuestion}
                  </p>
                  <p className="mt-2 text-xs text-amber-700">
                    Add the answer to the task notes, then ask Leo to try again.
                  </p>
                </div>
              )}

              {run.draft && run.status !== "researching" && (
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {run.draftTitle || "Leo's first draft"}
                  </label>
                  <textarea
                    value={drafts[run.id] ?? run.draft}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [run.id]: event.target.value,
                      }))
                    }
                    rows={16}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm leading-6 text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void saveRun(run, false)}
                      disabled={savingId === run.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Save size={14} /> Save edits
                    </button>
                    <button
                      onClick={() => void saveRun(run, true)}
                      disabled={savingId === run.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check size={14} /> Mark reviewed
                    </button>
                  </div>
                </div>
              )}

              {run.status === "human_only" && (
                <p className="text-sm text-slate-600">
                  Leo evaluated this task and left it with you because it does not yet have a safe,
                  useful background deliverable.
                </p>
              )}

              {run.sources.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Research trail
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {run.sources.map((source, index) => {
                      const key = workSourceKey(source);
                      const rating = sourceFeedback[run.id]?.[key];
                      const canRate =
                        source.type !== "task" &&
                        source.type !== "feedback" &&
                        (!source.status || source.status === "used");
                      return (
                        <span
                          key={`${source.type}-${source.title}-${index}`}
                          className="inline-flex items-center rounded-full border border-slate-200 bg-white"
                        >
                          {source.url && (!source.status || source.status === "used") ? (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-violet-700"
                            >
                              {source.title}
                              <ExternalLink size={11} />
                            </a>
                          ) : (
                            <span
                              title={source.excerpt}
                              className={`px-3 py-1.5 text-xs ${
                                source.status === "error"
                                  ? "text-red-700"
                                  : source.status === "no_match" ||
                                      source.status === "unavailable"
                                    ? "text-amber-700"
                                    : "text-slate-500"
                              }`}
                            >
                              {source.title}
                              {source.status && source.status !== "used"
                                ? ` · ${source.status.replace("_", " ")}`
                                : ""}
                            </span>
                          )}
                          {canRate && (
                            <span className="flex items-center border-l border-slate-200 pr-1">
                              <button
                                onClick={() => rateSource(run.id, source, "useful")}
                                className={`rounded-full p-1.5 ${
                                  rating === "useful"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "text-slate-300 hover:text-emerald-600"
                                }`}
                                title="This source was useful"
                              >
                                <ThumbsUp size={11} />
                              </button>
                              <button
                                onClick={() => rateSource(run.id, source, "irrelevant")}
                                className={`rounded-full p-1.5 ${
                                  rating === "irrelevant"
                                    ? "bg-red-100 text-red-700"
                                    : "text-slate-300 hover:text-red-600"
                                }`}
                                title="This source was irrelevant"
                              >
                                <ThumbsDown size={11} />
                              </button>
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {run.status !== "researching" && (
                <div className="rounded-xl border border-violet-100 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <MessageSquareText size={16} className="text-violet-600" />
                    <p className="text-sm font-semibold text-slate-900">
                      Help Leo improve this work
                    </p>
                  </div>
                  <textarea
                    value={feedback[run.id] ?? ""}
                    onChange={(event) =>
                      setFeedback((current) => ({
                        ...current,
                        [run.id]: event.target.value,
                      }))
                    }
                    rows={3}
                    placeholder="What should change? You can also name a missing document, meeting, email thread, or source Leo should find."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                  />
                  <label className="mt-3 flex items-start gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={rememberPreference[run.id] === true}
                      onChange={(event) =>
                        setRememberPreference((current) => ({
                          ...current,
                          [run.id]: event.target.checked,
                        }))
                      }
                      disabled={!feedback[run.id]?.trim()}
                      className="mt-0.5 rounded border-slate-300 text-violet-600"
                    />
                    Remember this as a lasting preference. Leave unchecked for feedback that
                    applies only to this deliverable.
                  </label>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        void revise(run, { includeFeedback: true })
                      }
                      disabled={
                        retryingId === run.id ||
                        (!feedback[run.id]?.trim() &&
                          Object.keys(sourceFeedback[run.id] ?? {}).length === 0)
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
                    >
                      <MessageSquareText size={14} /> Revise with feedback
                    </button>
                    <button
                      onClick={() =>
                        void revise(run, {
                          includeFeedback: true,
                          researchAgain: true,
                        })
                      }
                      disabled={retryingId === run.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-40"
                    >
                      <Search size={14} /> Research again
                    </button>
                    <button
                      onClick={() => void revise(run)}
                      disabled={retryingId === run.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <RefreshCw
                        size={14}
                        className={retryingId === run.id ? "animate-spin" : ""}
                      />
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
