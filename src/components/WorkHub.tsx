"use client";

import React from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Bot,
  Building2,
  ChevronDown,
  CircleCheckBig,
  Handshake,
  Hourglass,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";
import UnifiedTaskTable from "./UnifiedTaskTable";

interface WorkHubProps {
  onOpenZenMode?: (task: Task) => void;
}

const domains = [
  {
    label: "Curriculum",
    description: "Design, build, evaluate, and improve the system.",
    icon: BookOpenCheck,
    className: "bg-violet-50 border-violet-100 text-violet-700",
    href: "/curriculum",
  },
  {
    label: "Partner Success",
    description: "Resolve needs, preserve relationships, and follow through.",
    icon: Handshake,
    className: "bg-emerald-50 border-emerald-100 text-emerald-700",
    href: "/partner-tasks",
  },
  {
    label: "Willow Leadership",
    description: "Move company priorities, partnerships, decisions, and ideas.",
    icon: Building2,
    className: "bg-sky-50 border-sky-100 text-sky-700",
    href: "/decisions",
  },
] as const;

export default function WorkHub({ onOpenZenMode }: WorkHubProps) {
  const { state } = useApp();
  const activeProjects = state.projects.filter((project) => !project.archived);
  const activeTasks = state.tasks.filter(
    (task) => task.status !== "completed" && !task.parentTaskId,
  );
  const readyCount = activeTasks.filter((task) => task.status !== "blocked").length;
  const waitingCount = activeTasks.filter((task) => task.status === "blocked").length;

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header>
        <p className="text-sm font-semibold text-indigo-600">Work</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          One shared queue for you and Leo
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          Capture what needs to happen. Projects and labels are optional context,
          not work you have to maintain.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
          <div className="flex items-center gap-2 text-indigo-700">
            <CircleCheckBig size={18} />
            <h2 className="font-semibold">Ready for you</h2>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-950">{readyCount}</p>
          <p className="mt-1 text-sm text-slate-600">
            Open Leo tasks, plus partner work in the queue below.
          </p>
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
          <p className="mt-1 text-sm text-slate-600">
            Work currently marked blocked or waiting on someone else.
          </p>
        </section>
      </div>

      <UnifiedTaskTable onFocusTask={onOpenZenMode} title="Open work" />

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-sm font-semibold text-slate-700">
          <ChevronDown
            size={17}
            className="transition-transform group-open:rotate-180"
          />
          Browse optional context and existing initiatives
        </summary>
        <div className="space-y-6 border-t border-slate-100 p-5">
          <div className="grid gap-4 lg:grid-cols-3">
            {domains.map((domain) => {
              const Icon = domain.icon;
              return (
                <a
                  key={domain.label}
                  href={domain.href}
                  className={`rounded-xl border p-4 transition-shadow hover:shadow-sm ${domain.className}`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <Icon size={18} /> {domain.label}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{domain.description}</p>
                </a>
              );
            })}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Existing initiatives</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Formerly projects. They remain available when deeper context is useful.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {activeProjects.length}
              </span>
            </div>
            {activeProjects.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {activeProjects.map((project) => (
                  <a
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 hover:border-indigo-200 hover:bg-indigo-50/40"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="flex-1 truncate text-sm font-medium text-slate-800">
                      {project.name}
                    </span>
                    <ArrowRight size={14} className="text-slate-400" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No active initiatives.</p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
