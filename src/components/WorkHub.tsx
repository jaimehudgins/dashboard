"use client";

import React from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  Handshake,
} from "lucide-react";
import { useApp } from "@/store/store";

const domains = [
  {
    label: "Curriculum",
    description: "Design, build, evaluate, and improve the system.",
    icon: BookOpenCheck,
    className: "bg-violet-50 border-violet-100 text-violet-700",
    links: [
      { label: "Curriculum tracker", href: "/curriculum" },
      { label: "Improvement signals", href: "/curriculum-signal" },
      { label: "Repository", href: "/curriculum-repo" },
    ],
  },
  {
    label: "Partner Success",
    description: "Resolve needs, preserve relationships, and follow through.",
    icon: Handshake,
    className: "bg-emerald-50 border-emerald-100 text-emerald-700",
    links: [
      { label: "Partner tasks", href: "/partner-tasks" },
      { label: "Mail", href: "/mail" },
      { label: "Meeting context", href: "/meetings" },
    ],
  },
  {
    label: "Willow Leadership",
    description: "Move company priorities, partnerships, decisions, and ideas.",
    icon: Building2,
    className: "bg-sky-50 border-sky-100 text-sky-700",
    links: [
      { label: "Decisions", href: "/decisions" },
      { label: "Writing", href: "/sam" },
      { label: "Backlog", href: "/backlog" },
    ],
  },
] as const;

export default function WorkHub() {
  const { state } = useApp();
  const activeProjects = state.projects.filter((project) => !project.archived);

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header>
        <p className="text-sm font-semibold text-indigo-600">Work</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          Outcomes across your three domains
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          These are overlapping lenses, not silos. Leo will eventually assemble and conduct the work across all three.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {domains.map((domain) => {
          const Icon = domain.icon;
          return (
            <section key={domain.label} className={`rounded-2xl border p-5 ${domain.className}`}>
              <div className="inline-flex rounded-xl bg-white p-2.5 shadow-sm">
                <Icon size={21} />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-slate-950">{domain.label}</h2>
              <p className="mt-1 min-h-10 text-sm text-slate-600">{domain.description}</p>
              <div className="mt-5 space-y-2">
                {domain.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded-lg bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                  >
                    {link.label} <ArrowRight size={14} />
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Active projects</h2>
            <p className="mt-1 text-sm text-slate-500">Current containers for work while the outcome model develops.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {activeProjects.length} active
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
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                <span className="truncate text-sm font-medium text-slate-800">{project.name}</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No active projects.</p>
        )}
      </section>
    </div>
  );
}
