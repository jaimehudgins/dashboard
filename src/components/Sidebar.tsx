"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Command,
  FolderKanban,
  Inbox,
  Calendar,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useApp } from "@/store/store";
import QuickCapture from "./QuickCapture";
import ProjectCreateModal from "./ProjectCreateModal";

interface SidebarProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/", label: "Command Center", icon: Command },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/archive", label: "Daily Archive", icon: Calendar },
];

export default function Sidebar({ children }: SidebarProps) {
  const pathname = usePathname();
  const { state } = useApp();
  const [showCreateProject, setShowCreateProject] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Fixed Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
        {/* Logo */}
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Strategic Engine
          </h1>
          <p className="text-xs text-slate-500 mt-1">Execution Dashboard</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon size={18} />
                {item.label}
                {item.href === "/inbox" && state.inbox.length > 0 && (
                  <span className="ml-auto bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {state.inbox.length}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Projects Section */}
          <div className="pt-6">
            <div className="flex items-center justify-between px-3 mb-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Projects
              </h3>
              <button
                onClick={() => setShowCreateProject(true)}
                className="text-slate-400 hover:text-indigo-500 transition-colors"
                aria-label="Create new project"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="space-y-1">
              {state.projects.map((project) => {
                const isActive = pathname === `/projects/${project.id}`;
                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-indigo-50 text-indigo-600"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="truncate">{project.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Footer Stats */}
        <div className="p-4 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            <div className="flex justify-between">
              <span>Active Tasks</span>
              <span className="text-slate-700 font-medium">
                {state.tasks.filter((t) => t.status !== "completed").length}
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Completed Today</span>
              <span className="text-slate-700 font-medium">
                {state.completedToday.length}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {/* Quick Capture Header */}
        <QuickCapture />

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-8">{children}</div>
      </main>

      {showCreateProject && (
        <ProjectCreateModal onClose={() => setShowCreateProject(false)} />
      )}
    </div>
  );
}
