"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareText,
} from "lucide-react";

type Urgency = "now" | "question" | "later" | null;

interface MailThread {
  id: string;
  from: string;
  subject: string;
  unread: boolean;
  urgency?: Urgency;
}

interface Meeting {
  tasks: {
    id: string;
    task: string;
    status: "pending" | "confirmed" | "dismissed";
  }[];
}

const lanes = [
  {
    key: "critical",
    label: "Critical",
    description: "Interrupt now",
    icon: AlertTriangle,
    color: "text-rose-600",
    background: "bg-rose-50 border-rose-100",
  },
  {
    key: "quick",
    label: "Quick actions",
    description: "Prepare for the next response window",
    icon: Mail,
    color: "text-emerald-600",
    background: "bg-emerald-50 border-emerald-100",
  },
  {
    key: "commitments",
    label: "Commitments",
    description: "Promises that need follow-through",
    icon: MessageSquareText,
    color: "text-amber-600",
    background: "bg-amber-50 border-amber-100",
  },
  {
    key: "watch",
    label: "Watch",
    description: "Signals worth remembering, not interrupting",
    icon: Clock3,
    color: "text-sky-600",
    background: "bg-sky-50 border-sky-100",
  },
] as const;

export default function AttentionHub() {
  const [mail, setMail] = useState<MailThread[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
        setError(failed);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const counts = useMemo(
    () => ({
      critical: mail.filter((thread) => thread.unread && thread.urgency === "now").length,
      quick: mail.filter((thread) => thread.unread && thread.urgency === "question").length,
      commitments: meetings.flatMap((meeting) => meeting.tasks).filter((task) => task.status === "pending").length,
      watch: mail.filter((thread) => thread.unread && thread.urgency === "later").length,
    }),
    [mail, meetings],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-semibold text-indigo-600">Attention</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          What needs you—not just what is new
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          This first slice uses Gmail urgency and Granola commitments. Drafts, partner memory, and batch approvals come next.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          One or more sources are unavailable. Leo will show what it can without guessing.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {lanes.map((lane) => {
          const Icon = lane.icon;
          const count = counts[lane.key];
          const href = lane.key === "commitments" ? "/meetings" : "/mail";
          return (
            <a
              key={lane.key}
              href={href}
              className={`group rounded-2xl border p-5 transition-transform hover:-translate-y-0.5 ${lane.background}`}
            >
              <div className="flex items-start justify-between">
                <div className={`rounded-xl bg-white p-2.5 shadow-sm ${lane.color}`}>
                  <Icon size={20} />
                </div>
                <span className="text-3xl font-bold text-slate-900">
                  {loading ? "–" : count}
                </span>
              </div>
              <h2 className="mt-5 font-semibold text-slate-900">{lane.label}</h2>
              <p className="mt-1 text-sm text-slate-600">{lane.description}</p>
              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                Review source <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </div>
            </a>
          );
        })}
      </div>

      {!loading && Object.values(counts).every((count) => count === 0) && !error && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-slate-600 shadow-sm">
          <CheckCircle2 size={20} className="text-emerald-500" />
          Nothing currently needs your attention.
        </div>
      )}
    </div>
  );
}
