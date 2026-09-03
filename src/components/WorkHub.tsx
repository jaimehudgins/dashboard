"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Bot,
  Building2,
  CalendarRange,
  ChevronDown,
  CircleCheckBig,
  FileText,
  FolderGit2,
  Handshake,
  Hourglass,
  ListTodo,
  MessageSquareText,
  Radio,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";
import UnifiedTaskTable from "./UnifiedTaskTable";

interface WorkHubProps {
  onOpenZenMode?: (task: Task) => void;
}

type WorkView = "shared" | "weekly" | "curriculum";
type Workstream = "curriculum" | "partner" | "leadership" | "unassigned";
type NamedWorkstream = Exclude<Workstream, "unassigned">;

const WORKSTREAMS: Array<{
  id: NamedWorkstream;
  label: string;
  outcome: string;
  icon: typeof BookOpenCheck;
  className: string;
}> = [
  {
    id: "curriculum",
    label: "Curriculum",
    outcome: "Build world-class curriculum and stay six to eight weeks ahead.",
    icon: BookOpenCheck,
    className: "bg-violet-50 text-violet-700",
  },
  {
    id: "partner",
    label: "Partner Success",
    outcome: "Resolve needs quickly, preserve relationships, and follow through.",
    icon: Handshake,
    className: "bg-emerald-50 text-emerald-700",
  },
  {
    id: "leadership",
    label: "Willow Leadership",
    outcome: "Move company priorities, partnerships, decisions, and ideas.",
    icon: Building2,
    className: "bg-sky-50 text-sky-700",
  },
];

function taskWorkstream(
  task: Task,
  projects: { id: string; name: string }[],
  areas: { id: string; name: string }[],
): Workstream {
  const project = projects.find((item) => item.id === task.projectId)?.name ?? "";
  const area = areas.find((item) => item.id === task.areaId)?.name ?? "";
  const context = `${project} ${area}`.toLowerCase();

  if (context.includes("curriculum")) return "curriculum";
  if (
    context.includes("partner") ||
    context.includes("customer") ||
    context.includes("consult")
  ) {
    return "partner";
  }
  if (context.includes("leadership") || context.includes("willow")) {
    return "leadership";
  }
  return "unassigned";
}

function taskSort(a: Task, b: Task): number {
  if (a.dueDate && b.dueDate) {
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  }
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  const priority = { critical: 0, high: 1, medium: 2, low: 3 };
  return priority[a.priority] - priority[b.priority];
}

function EmptyWork({ label }: { label: string }) {
  return (
    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
      No {label.toLowerCase()} here.
    </p>
  );
}

export default function WorkHub({ onOpenZenMode }: WorkHubProps) {
  const { state } = useApp();
  const [view, setView] = useState<WorkView>("shared");
  const activeProjects = state.projects.filter((project) => !project.archived);
  const activeTasks = useMemo(
    () =>
      state.tasks
        .filter((task) => task.status !== "completed" && !task.parentTaskId)
        .sort(taskSort),
    [state.tasks],
  );
  const readyCount = activeTasks.filter((task) => task.status !== "blocked").length;
  const waitingCount = activeTasks.filter((task) => task.status === "blocked").length;
  const tasksByWorkstream = useMemo(() => {
    const groups: Record<Workstream, Task[]> = {
      curriculum: [],
      partner: [],
      leadership: [],
      unassigned: [],
    };
    activeTasks.forEach((task) => {
      groups[taskWorkstream(task, state.projects, state.areas)].push(task);
    });
    return groups;
  }, [activeTasks, state.projects, state.areas]);
  const curriculumTasks = tasksByWorkstream.curriculum;
  const unassignedTasks = tasksByWorkstream.unassigned;
  const curriculumDueInEightWeeks = curriculumTasks.filter((task) => {
    if (!task.dueDate) return false;
    const days =
      (new Date(task.dueDate).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 56;
  }).length;

  const viewOptions: Array<{ id: WorkView; label: string }> = [
    { id: "shared", label: "Shared queue" },
    { id: "weekly", label: "Weekly workstream scan" },
    { id: "curriculum", label: "Curriculum deep dive" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap gap-2">
        {viewOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => setView(option.id)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              view === option.id
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {view === "shared" && (
        <>
          <header>
            <p className="text-sm font-semibold text-indigo-600">Work</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              One shared queue for you and Leo
            </h1>
            <p className="mt-2 max-w-3xl text-slate-500">
              Stay in one list, then narrow it instantly when a workstream needs attention.
            </p>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
              <div className="flex items-center gap-2 text-indigo-700">
                <CircleCheckBig size={18} />
                <h2 className="font-semibold">Ready for you</h2>
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-950">{readyCount}</p>
              <p className="mt-1 text-sm text-slate-600">Open Leo tasks, plus partner work below.</p>
            </section>
            <section className="rounded-2xl border border-violet-100 bg-violet-50/60 p-5">
              <div className="flex items-center gap-2 text-violet-700">
                <Bot size={18} />
                <h2 className="font-semibold">Leo preparing</h2>
              </div>
              <p className="mt-3 text-lg font-semibold text-slate-900">Coming next</p>
              <p className="mt-1 text-sm text-slate-600">
                Research, context packets, and first drafts will appear here.
              </p>
            </section>
            <section className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5">
              <div className="flex items-center gap-2 text-amber-700">
                <Hourglass size={18} />
                <h2 className="font-semibold">Waiting</h2>
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-950">{waitingCount}</p>
              <p className="mt-1 text-sm text-slate-600">Blocked work or work waiting on someone else.</p>
            </section>
          </div>

          <UnifiedTaskTable
            onFocusTask={onOpenZenMode}
            title="Open work"
            showWorkstreamLenses
          />
        </>
      )}

      {view === "weekly" && (
        <>
          <header>
            <p className="text-sm font-semibold text-indigo-600">Weekly scan</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              Are all three workstreams moving?
            </h1>
            <p className="mt-2 text-slate-500">
              Scan your next moves and anything waiting without maintaining separate systems.
            </p>
          </header>

          <div className="space-y-4">
            {unassignedTasks.length > 0 && (
              <button
                onClick={() => setView("shared")}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100"
              >
                <span>
                  <strong>{unassignedTasks.length} captured task{unassignedTasks.length === 1 ? "" : "s"}</strong>{" "}
                  still need a workstream.
                </span>
                <span className="text-xs font-semibold">Organize in shared queue →</span>
              </button>
            )}
            {WORKSTREAMS.map((workstream) => {
              const Icon = workstream.icon;
              const tasks = tasksByWorkstream[workstream.id];
              const ready = tasks.filter((task) => task.status !== "blocked").slice(0, 4);
              const waiting = tasks.filter((task) => task.status === "blocked").slice(0, 3);
              return (
                <section
                  key={workstream.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className={`rounded-lg p-2 ${workstream.className}`}>
                        <Icon size={18} />
                      </span>
                      <div>
                        <h2 className="font-semibold text-slate-900">{workstream.label}</h2>
                        <p className="mt-0.5 text-xs text-slate-500">{workstream.outcome}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${workstream.className}`}>
                      {tasks.length} open
                    </span>
                  </div>
                  <div className="grid md:grid-cols-3">
                    <div className="p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Your move</p>
                      <div className="space-y-2">
                        {ready.length > 0 ? ready.map((task) => (
                          <button
                            key={task.id}
                            onClick={() => onOpenZenMode?.(task)}
                            className="w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-indigo-50"
                          >
                            {task.title}
                          </button>
                        )) : <EmptyWork label="Ready work" />}
                      </div>
                    </div>
                    <div className="border-t border-slate-100 p-4 md:border-l md:border-t-0">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Leo preparing</p>
                      <div className="rounded-lg bg-violet-50 px-3 py-3 text-sm text-violet-700">
                        <Bot size={15} className="mb-2" />
                        Drafts and research packets will appear here in the next phase.
                      </div>
                    </div>
                    <div className="border-t border-slate-100 p-4 md:border-l md:border-t-0">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Waiting</p>
                      <div className="space-y-2">
                        {waiting.length > 0 ? waiting.map((task) => (
                          <button
                            key={task.id}
                            onClick={() => onOpenZenMode?.(task)}
                            className="w-full rounded-lg bg-amber-50 px-3 py-2 text-left text-sm font-medium text-amber-900 hover:bg-amber-100"
                          >
                            {task.title}
                          </button>
                        )) : <EmptyWork label="Waiting work" />}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {view === "curriculum" && (
        <>
          <header>
            <p className="text-sm font-semibold text-violet-600">Workstream control tower</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Curriculum</h1>
            <p className="mt-2 text-slate-500">
              Quality, upcoming delivery, feedback, and active work in one focused view.
            </p>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <section className="rounded-xl bg-slate-100 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Needs you now</p>
              <p className="mt-3 font-semibold text-slate-900">
                {curriculumTasks[0]?.title || "No curriculum task is urgent"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {curriculumTasks[0] ? "Highest-ranked open curriculum task" : "Your curriculum runway is clear"}
              </p>
            </section>
            <section className="rounded-xl bg-violet-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">Leo preparing</p>
              <p className="mt-3 font-semibold text-slate-900">Work packets coming next</p>
              <p className="mt-1 text-xs text-slate-500">Drive, curriculum repo, feedback, and meetings</p>
            </section>
            <section className="rounded-xl bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Coming into range</p>
              <p className="mt-3 font-semibold text-slate-900">
                {curriculumDueInEightWeeks} task{curriculumDueInEightWeeks === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Due within the next eight weeks</p>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListTodo size={18} className="text-violet-500" />
                  <h2 className="font-semibold text-slate-900">Curriculum queue</h2>
                </div>
                <span className="text-xs text-slate-400">{curriculumTasks.length} open</span>
              </div>
              <div className="divide-y divide-slate-100">
                {curriculumTasks.length > 0 ? curriculumTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onOpenZenMode?.(task)}
                    className="flex w-full items-start gap-3 py-3 text-left hover:bg-violet-50/50"
                  >
                    <span className="mt-1 h-4 w-4 flex-shrink-0 rounded-full border border-slate-300" />
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-slate-800">{task.title}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {task.dueDate
                          ? `Due ${new Date(task.dueDate).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}`
                          : `${task.priority} priority`}
                      </span>
                    </span>
                    <ArrowRight size={14} className="mt-1 text-slate-300" />
                  </button>
                )) : <EmptyWork label="Curriculum work" />}
              </div>
            </section>

            <div className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <FolderGit2 size={18} className="text-violet-500" />
                  <h2 className="font-semibold text-slate-900">Source systems</h2>
                </div>
                <div className="space-y-2">
                  <a href="/curriculum-repo" className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"><FolderGit2 size={15} /> Curriculum repository</a>
                  <a href="/mrsl" className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"><FileText size={15} /> Google Drive</a>
                  <a href="/meetings" className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"><MessageSquareText size={15} /> Meeting decisions</a>
                  <a href="/curriculum-signal" className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"><Radio size={15} /> Quality signals</a>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <CalendarRange size={18} className="text-amber-500" />
                  <h2 className="font-semibold text-slate-900">Six-to-eight-week window</h2>
                </div>
                <p className="text-sm text-slate-500">
                  Lesson schedule integration will surface units before teachers begin preparing them.
                </p>
              </section>
            </div>
          </div>
        </>
      )}

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-sm font-semibold text-slate-700">
          <ChevronDown size={17} className="transition-transform group-open:rotate-180" />
          Existing initiatives
          <span className="ml-auto text-xs font-normal text-slate-400">{activeProjects.length}</span>
        </summary>
        <div className="grid gap-3 border-t border-slate-100 p-5 md:grid-cols-2 xl:grid-cols-3">
          {activeProjects.map((project) => (
            <a
              key={project.id}
              href={`/projects/${project.id}`}
              className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 hover:bg-indigo-50"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
              <span className="flex-1 truncate text-sm font-medium text-slate-800">{project.name}</span>
              <ArrowRight size={14} className="text-slate-400" />
            </a>
          ))}
        </div>
      </details>
    </div>
  );
}
