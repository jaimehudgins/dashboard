"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  CheckCircle2,
  Bot,
  ExternalLink,
  FileText,
  Focus,
  Folder,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  Paperclip,
  Pencil,
  X,
} from "lucide-react";

import { WorkBrief, WorkResearchSource, WorkRun } from "@/lib/workbench";
import { previewTaskWorkBrief } from "@/lib/workbench-client";
import { Area, Attachment, Comment, Project, Task } from "@/types";

interface TaskDetailModalProps {
  title: string;
  description?: string;
  link?: string;
  relatedLinks?: string[];
  dueDate: Date | null;
  status: string;
  priority?: string;
  area: string;
  projectName?: string;
  partnerName?: string;
  comments?: Comment[];
  attachments?: Attachment[];
  task?: Task;
  project?: Project;
  taskArea?: Area;
  workRun?: WorkRun;
  preparingWork?: boolean;
  onPrepareWork?: () => Promise<void>;
  onClose: () => void;
  onEdit: () => void;
  onFocus?: () => void;
}

const ROUTE_LABELS: Record<WorkBrief["route"], string> = {
  leo_starts: "Leo can draft",
  leo_prepares: "Leo can prepare",
  jaime_action: "Jaime-only action",
};

const ROUTE_STYLES: Record<WorkBrief["route"], string> = {
  leo_starts: "bg-emerald-100 text-emerald-800",
  leo_prepares: "bg-violet-100 text-violet-800",
  jaime_action: "bg-amber-100 text-amber-800",
};

const SOURCE_LABELS: Record<WorkResearchSource, string> = {
  drive: "Google Drive",
  curriculum_repo: "Curriculum repo",
  gmail: "Gmail",
  granola: "Granola",
  crm: "TEMU",
  platform: "Platform guidance",
  slack: "Slack",
};

function briefValue(excerpt: string, label: string) {
  return (
    excerpt
      .split("\n")
      .find((line) => line.startsWith(`${label}: `))
      ?.slice(label.length + 2)
      .trim() || ""
  );
}

function storedWorkBrief(run?: WorkRun): WorkBrief | null {
  const source = run?.sources.find(
    (item) => item.type === "brief" && item.title === "Leo work brief",
  );
  if (source?.brief) return source.brief;
  if (!source?.excerpt || !run) return null;
  const routeText = briefValue(source.excerpt, "Route").replaceAll(" ", "_");
  if (
    routeText !== "leo_starts" &&
    routeText !== "leo_prepares" &&
    routeText !== "jaime_action"
  ) {
    return null;
  }
  const confidenceText = briefValue(source.excerpt, "Confidence");
  const allowedSources = new Set<WorkResearchSource>([
    "drive",
    "curriculum_repo",
    "gmail",
    "granola",
    "crm",
    "platform",
    "slack",
  ]);
  const requiredSources = briefValue(source.excerpt, "Required sources")
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is WorkResearchSource =>
      allowedSources.has(item as WorkResearchSource),
    );
  return {
    route: routeText,
    confidence:
      confidenceText === "high" || confidenceText === "medium"
        ? confidenceText
        : "low",
    rationale:
      briefValue(source.excerpt, "Reason") ||
      run.rationale ||
      "Leo assessed the safest useful starting point.",
    intendedDeliverable: briefValue(source.excerpt, "Deliverable"),
    audience: briefValue(source.excerpt, "Audience"),
    outcome: briefValue(source.excerpt, "Outcome"),
    constraints: briefValue(source.excerpt, "Constraints")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean),
    requiredSources,
    searchTerms: [],
  };
}

function linkLabel(url: string, fallback: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname.includes("docs.google.com")) return "Google Drive file";
    if (hostname.includes("drive.google.com")) return "Google Drive file";
    if (hostname.includes("mail.google.com")) return "Gmail thread";
    return hostname;
  } catch {
    return fallback;
  }
}

function LinkedText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
        if (!part.startsWith("http://") && !part.startsWith("https://")) {
          return <React.Fragment key={index}>{part}</React.Fragment>;
        }
        const match = part.match(/^(.*?)([),.;!?]*)$/);
        const url = match?.[1] || part;
        const trailing = match?.[2] || "";
        return (
          <React.Fragment key={index}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-800"
            >
              {url}
            </a>
            {trailing}
          </React.Fragment>
        );
      })}
    </p>
  );
}

export default function TaskDetailModal({
  title,
  description,
  link,
  relatedLinks = [],
  dueDate,
  status,
  priority,
  area,
  projectName,
  partnerName,
  comments = [],
  attachments = [],
  task,
  project,
  taskArea,
  workRun,
  preparingWork = false,
  onPrepareWork,
  onClose,
  onEdit,
  onFocus,
}: TaskDetailModalProps) {
  const savedBrief = useMemo(() => storedWorkBrief(workRun), [workRun]);
  const [brief, setBrief] = useState<WorkBrief | null>(savedBrief);
  const [briefLoading, setBriefLoading] = useState(
    Boolean(task && !savedBrief),
  );
  const [briefError, setBriefError] = useState<string | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!task || savedBrief) return;
    let cancelled = false;
    void previewTaskWorkBrief({ task, project, area: taskArea })
      .then((result) => {
        if (!cancelled) setBrief(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setBriefError(
            error instanceof Error ? error.message : "Leo could not assess this task",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBriefLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, savedBrief, task, taskArea]);

  const links = useMemo(() => {
    const candidates = [
      ...(link ? [{ url: link, label: linkLabel(link, "Task link") }] : []),
      ...relatedLinks.map((url, index) => ({
        url,
        label: linkLabel(url, `Related file ${index + 1}`),
      })),
      ...attachments.map((attachment) => ({
        url: attachment.fileUrl,
        label: attachment.fileName,
      })),
    ];
    return candidates.filter(
      (candidate, index) =>
        candidates.findIndex((item) => item.url === candidate.url) === index,
    );
  }, [attachments, link, relatedLinks]);
  const displayedBrief = savedBrief || brief;

  const prepareWork = async () => {
    if (!onPrepareWork) return;
    setPrepareError(null);
    try {
      await onPrepareWork();
    } catch (error) {
      setPrepareError(
        error instanceof Error ? error.message : "Leo could not start this work",
      );
    }
  };

  const sourceState = (sourceType: WorkResearchSource) => {
    const matching = workRun?.sources.filter(
      (source) => source.type === sourceType,
    );
    if (!matching?.length) {
      return workRun && workRun.status !== "researching" ? "no_match" : "planned";
    }
    if (
      matching.some(
        (source) =>
          (!source.status || source.status === "used") &&
          Boolean(source.excerpt?.trim()),
      )
    ) {
      return "used";
    }
    if (matching.some((source) => source.status === "error")) return "error";
    if (matching.some((source) => source.status === "unavailable")) {
      return "unavailable";
    }
    return "no_match";
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-start gap-4 border-b border-slate-100 px-6 py-5">
          <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
            <FileText size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Task details
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{title}</h2>
            {partnerName && (
              <p className="mt-1 text-sm text-slate-500">{partnerName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close task details"
          >
            <X size={19} />
          </button>
        </header>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium capitalize text-slate-700">
              {status.replaceAll("_", " ")}
            </span>
            {priority && (
              <span className="rounded-full bg-amber-50 px-3 py-1 font-medium capitalize text-amber-700">
                {priority} priority
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
              <MapPin size={12} /> {area}
            </span>
            {projectName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-700">
                <Folder size={12} /> {projectName}
              </span>
            )}
            {dueDate && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">
                <Calendar size={12} />
                {dueDate.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Notes and context
            </h3>
            {description ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <LinkedText text={description} />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">
                No notes have been added to this task.
              </p>
            )}
          </section>

          {task && onPrepareWork && (
            <section className="overflow-hidden rounded-2xl border border-violet-200 bg-violet-50/50">
              <div className="flex items-start gap-3 border-b border-violet-100 px-4 py-3">
                <span className="rounded-lg bg-white p-2 text-violet-600 shadow-sm">
                  <Bot size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Leo Work Brief
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    What Leo can do, what it will produce, and what it needs.
                  </p>
                </div>
                {displayedBrief && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ROUTE_STYLES[displayedBrief.route]}`}
                  >
                    {ROUTE_LABELS[displayedBrief.route]}
                  </span>
                )}
              </div>

              <div className="space-y-4 px-4 py-4">
                {briefLoading && (
                  <p className="flex items-center gap-2 text-sm text-violet-700">
                    <LoaderCircle size={16} className="animate-spin" />
                    Leo is assessing the safest useful starting point…
                  </p>
                )}

                {briefError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {briefError}
                  </p>
                )}

                {displayedBrief && (
                  <>
                    <p className="text-sm leading-6 text-slate-700">
                      {displayedBrief.rationale}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Deliverable
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {displayedBrief.intendedDeliverable ||
                            "Useful preparation, if available"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Audience
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {displayedBrief.audience || "Jaime"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Intended outcome
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {displayedBrief.outcome || task.title}
                      </p>
                    </div>
                    {displayedBrief.requiredSources.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Source plan
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {displayedBrief.requiredSources.map((source) => {
                            const status = sourceState(source);
                            return (
                              <span
                                key={source}
                                className="inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-white px-2.5 py-1 text-xs font-medium text-slate-600"
                              >
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    status === "used"
                                      ? "bg-emerald-500"
                                      : status === "error" || status === "unavailable"
                                        ? "bg-red-400"
                                        : status === "no_match"
                                          ? "bg-amber-400"
                                          : "bg-violet-300"
                                  }`}
                                />
                                {SOURCE_LABELS[source]}
                                {status === "used"
                                  ? " · used"
                                  : status === "no_match"
                                    ? " · no match"
                                    : status === "unavailable"
                                      ? " · unavailable"
                                      : status === "error"
                                        ? " · error"
                                        : " · will search"}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {workRun?.blockingQuestion && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                          Missing context
                        </p>
                        <p className="mt-1 text-sm font-medium text-amber-950">
                          {workRun.blockingQuestion}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 border-t border-violet-100 pt-3">
                      <button
                        onClick={() => void prepareWork()}
                        disabled={preparingWork || workRun?.status === "researching"}
                        className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {preparingWork || workRun?.status === "researching" ? (
                          <LoaderCircle size={14} className="animate-spin" />
                        ) : (
                          <Bot size={14} />
                        )}
                        {preparingWork || workRun?.status === "researching"
                          ? "Leo is working"
                          : !workRun
                            ? displayedBrief.route === "jaime_action"
                              ? "Ask Leo to prepare support"
                              : "Start Leo's work"
                            : displayedBrief.route === "jaime_action"
                              ? "Ask Leo to help anyway"
                              : "Research and prepare again"}
                      </button>
                      {workRun?.status === "draft_ready" && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 size={14} /> Draft ready in Workbench
                        </span>
                      )}
                      <p className="basis-full text-[11px] text-slate-500">
                        Before showing a draft, Leo checks grounding, completeness,
                        usefulness, and required-source coverage.
                      </p>
                    </div>
                    {prepareError && (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                        {prepareError}
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {links.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Paperclip size={13} /> Files and links
              </h3>
              <div className="space-y-2">
                {links.map((item) => (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    <FileText size={16} className="text-indigo-500" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            </section>
          )}

          {comments.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <MessageSquareText size={13} /> Comments
              </h3>
              <div className="space-y-2">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-xl border border-slate-200 px-4 py-3"
                  >
                    <LinkedText text={comment.content} />
                    <p className="mt-2 text-xs text-slate-400">
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Pencil size={15} /> Edit task
          </button>
          {onFocus && (
            <button
              onClick={onFocus}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Focus size={15} /> Focus on task
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
