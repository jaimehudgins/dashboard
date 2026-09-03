"use client";

import React, { useEffect, useState } from "react";
import { format, isBefore, startOfDay } from "date-fns";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareText,
  Sparkles,
  Target,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";
import TodayAgenda from "./TodayAgenda";
import UnifiedTaskTable from "./UnifiedTaskTable";

type Urgency = "now" | "question" | "later" | null;

interface MailThread {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  unread: boolean;
  urgency?: Urgency;
}

interface MeetingTask {
  id: string;
  task: string;
  due_date: string | null;
  partner_name: string | null;
  status: "pending" | "confirmed" | "dismissed";
}

interface Meeting {
  id: string;
  title: string;
  tasks: MeetingTask[];
}

interface TodayDashboardProps {
  onOpenZenMode?: (task: Task) => void;
}

const PRIORITY: Record<Task["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return (match ? match[1] : from.replace(/<.*>/, "")).trim() || from;
}

function taskDomain(
  task: Task,
  projects: { id: string; name: string }[],
  areas: { id: string; name: string }[],
): { label: string; className: string } {
  const project = projects.find((item) => item.id === task.projectId)?.name ?? "";
  const area = areas.find((item) => item.id === task.areaId)?.name ?? "";
  const context = `${project} ${area}`.toLowerCase();

  if (context.includes("curriculum")) {
    return { label: "Curriculum", className: "bg-violet-50 text-violet-700" };
  }
  if (
    context.includes("partner") ||
    context.includes("customer") ||
    context.includes("consult")
  ) {
    return { label: "Partner Success", className: "bg-emerald-50 text-emerald-700" };
  }
  return { label: "Willow Leadership", className: "bg-sky-50 text-sky-700" };
}

function nextBatchLabel(now: Date): string {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const batches = [
    { at: 8 * 60, label: "8:00 AM" },
    { at: 11 * 60, label: "11:00 AM" },
    { at: 14 * 60, label: "2:00 PM" },
    { at: 16 * 60 + 45, label: "4:45 PM" },
  ];
  return batches.find((batch) => batch.at > minutes)?.label ?? "Tomorrow at 8:00 AM";
}

export default function TodayDashboard({ onOpenZenMode }: TodayDashboardProps) {
  const { state } = useApp();
  const [mail, setMail] = useState<MailThread[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourceError, setSourceError] = useState(false);
  const now = new Date();
  const today = startOfDay(now);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      fetch("/api/mail/threads?view=all", { signal: controller.signal }).then(
        async (response) => {
          if (!response.ok) throw new Error("mail unavailable");
          return (await response.json()) as { threads?: MailThread[] };
        },
      ),
      fetch("/api/granola/meetings", { signal: controller.signal }).then(
        async (response) => {
          if (!response.ok) throw new Error("meetings unavailable");
          return (await response.json()) as { meetings?: Meeting[] };
        },
      ),
    ])
      .then(([mailResult, meetingResult]) => {
        if (mailResult.status === "fulfilled") {
          setMail(mailResult.value.threads ?? []);
        }
        if (meetingResult.status === "fulfilled") {
          setMeetings(meetingResult.value.meetings ?? []);
        }
        const failed = [mailResult, meetingResult].some(
          (result) =>
            result.status === "rejected" &&
            !(result.reason instanceof DOMException && result.reason.name === "AbortError"),
        );
        setSourceError(failed);
      })
      .finally(() => setSourcesLoading(false));

    return () => controller.abort();
  }, []);

  const activeTasks = state.tasks.filter(
    (task) => task.status !== "completed" && !task.parentTaskId,
  );

  const sortedTasks = [...activeTasks].sort((a, b) => {
    const aOverdue = a.dueDate && isBefore(new Date(a.dueDate), today) ? 0 : 1;
    const bOverdue = b.dueDate && isBefore(new Date(b.dueDate), today) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    if (PRIORITY[a.priority] !== PRIORITY[b.priority]) {
      return PRIORITY[a.priority] - PRIORITY[b.priority];
    }
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    return a.dueDate ? -1 : b.dueDate ? 1 : 0;
  });

  const urgentMail = mail.filter(
    (thread) => thread.unread && thread.urgency === "now",
  );
  const quickActionMail = mail.filter(
    (thread) => thread.unread && thread.urgency === "question",
  );
  const quickActions = quickActionMail.slice(0, 3);
  const allPendingCommitments = meetings
    .flatMap((meeting) =>
      meeting.tasks
        .filter((task) => task.status === "pending")
        .map((task) => ({
          ...task,
          meetingId: meeting.id,
          meetingTitle: meeting.title,
        })),
    );
  const pendingCommitments = allPendingCommitments.slice(0, 3);
  const waitingReviewCount =
    urgentMail.length + quickActionMail.length + allPendingCommitments.length;

  const criticalTask = sortedTasks.find(
    (task) =>
      task.priority === "critical" ||
      (task.dueDate && isBefore(new Date(task.dueDate), today)),
  );
  const criticalMail = urgentMail[0];
  const mostCritical = criticalMail
    ? {
        eyebrow: "Partner Success",
        title: criticalMail.subject || `Message from ${senderName(criticalMail.from)}`,
        reason: `${senderName(criticalMail.from)} sent an unread message classified as needing attention now.`,
        href: "/mail",
        task: null,
      }
    : criticalTask
      ? {
          eyebrow: taskDomain(criticalTask, state.projects, state.areas).label,
          title: criticalTask.title,
          reason: criticalTask.dueDate && isBefore(new Date(criticalTask.dueDate), today)
            ? `This ${criticalTask.priority}-priority item is overdue.`
            : "This is your highest-priority open outcome.",
          href: null,
          task: criticalTask,
        }
      : {
          eyebrow: "Protected capacity",
          title: "Choose the work that most improves Willow today",
          reason: "No critical issue is currently visible. Use the clear runway for high-judgment work.",
          href: "/work",
          task: null,
        };

  const curriculumTask = sortedTasks.find((task) => {
    const project = state.projects.find((item) => item.id === task.projectId)?.name ?? "";
    const area = state.areas.find((item) => item.id === task.areaId)?.name ?? "";
    return `${project} ${area}`.toLowerCase().includes("curriculum");
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-600">
            <Sparkles size={16} />
            Your operating brief
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            What will make Willow better today?
          </h1>
          <p className="mt-1 text-slate-500">{format(now, "EEEE, MMMM d, yyyy")}</p>
        </div>
        <a
          href="/attention"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
        >
          <Clock3 size={17} className="text-indigo-500" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Next response window
            </p>
            <p className="text-sm font-semibold text-slate-800">{nextBatchLabel(now)}</p>
            {!sourcesLoading && waitingReviewCount > 0 && (
              <p className="mt-0.5 text-xs font-medium text-indigo-600">
                {waitingReviewCount} item{waitingReviewCount === 1 ? "" : "s"} waiting
              </p>
            )}
          </div>
        </a>
      </header>

      <section className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-lg">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
              <Target size={15} /> Most critical · {mostCritical.eyebrow}
            </div>
            <h2 className="text-2xl font-semibold">{mostCritical.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              {mostCritical.reason}
            </p>
          </div>
          {mostCritical.task ? (
            <button
              onClick={() => onOpenZenMode?.(mostCritical.task!)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-indigo-50"
            >
              Start work <ArrowRight size={16} />
            </button>
          ) : (
            <a
              href={mostCritical.href ?? "/work"}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-indigo-50"
            >
              Open context <ArrowRight size={16} />
            </a>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain size={18} className="text-violet-500" />
                <h2 className="font-semibold text-slate-900">Deep work</h2>
              </div>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                Curriculum
              </span>
            </div>
            {curriculumTask ? (
              <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                <p className="text-lg font-semibold text-slate-900">{curriculumTask.title}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Current best curriculum candidate from your open work. Future versions will combine the lesson schedule, Human Curriculum Editor report, and field evidence.
                </p>
                <button
                  onClick={() => onOpenZenMode?.(curriculumTask)}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-900"
                >
                  Begin focused work <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 p-4">
                <p className="font-medium text-slate-800">Curriculum recommendation coming next</p>
                <p className="mt-1 text-sm text-slate-500">
                  This space will rank lessons six to eight weeks before use and assemble the full work package.
                </p>
              </div>
            )}
          </section>

          <TodayAgenda />
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail size={18} className="text-emerald-500" />
                <h2 className="font-semibold text-slate-900">Quick actions</h2>
              </div>
              <a href="/attention" className="text-xs font-semibold text-indigo-600 hover:underline">
                View attention →
              </a>
            </div>
            {sourcesLoading ? (
              <p className="text-sm text-slate-400">Checking partner signals…</p>
            ) : quickActions.length > 0 ? (
              <div className="space-y-3">
                {quickActions.map((thread) => (
                  <a
                    key={thread.id}
                    href={`/attention#email-${thread.id}`}
                    className="block rounded-xl bg-slate-50 p-3 hover:bg-slate-100"
                  >
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {thread.subject || "No subject"}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {senderName(thread.from)} · response context needed
                    </p>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {sourceError
                  ? "Partner signals are unavailable right now."
                  : "No quick-action messages are waiting."}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquareText size={18} className="text-amber-500" />
                <h2 className="font-semibold text-slate-900">Commitments</h2>
              </div>
              {allPendingCommitments.length > 0 && (
                <a href="/attention#meeting-follow-up" className="text-xs font-semibold text-indigo-600 hover:underline">
                  Review {allPendingCommitments.length} →
                </a>
              )}
            </div>
            {pendingCommitments.length > 0 ? (
              <div className="space-y-3">
                {pendingCommitments.map((commitment) => (
                  <a
                    key={commitment.id}
                    href={`/attention#meeting-${commitment.meetingId}`}
                    className="block rounded-xl border border-amber-100 bg-amber-50/50 p-3 hover:bg-amber-50"
                  >
                    <p className="text-sm font-medium text-slate-800">{commitment.task}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {commitment.partner_name || commitment.meetingTitle}
                      {commitment.due_date ? ` · due ${format(new Date(commitment.due_date), "MMM d")}` : ""}
                    </p>
                  </a>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <CheckCircle2 size={16} className="text-emerald-500" />
                No meeting commitments need review.
              </div>
            )}
          </section>
        </div>
      </div>

      <UnifiedTaskTable
        onFocusTask={onOpenZenMode}
        title="All open tasks"
      />

      <div className="flex justify-end">
        <a href="/eod" className="text-sm font-medium text-slate-500 hover:text-indigo-600">
          Close the day and choose tomorrow&rsquo;s focus →
        </a>
      </div>
    </div>
  );
}
