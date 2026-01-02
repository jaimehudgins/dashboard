"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Command,
  Inbox,
  Calendar,
  Plus,
  Pencil,
  Tags,
  GripVertical,
  CheckCircle2,
  Circle,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Project } from "@/types";
import QuickCapture from "./QuickCapture";
import ProjectCreateModal from "./ProjectCreateModal";
import ProjectEditModal from "./ProjectEditModal";
import TagManager from "./TagManager";
import MiscTasks from "./MiscTasks";

interface SidebarProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/", label: "Command Center", icon: Command },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/archive", label: "Daily Archive", icon: Calendar },
];

interface SortableProjectItemProps {
  project: Project;
  isActive: boolean;
  onEdit: (project: Project) => void;
}

function SortableProjectItem({
  project,
  isActive,
  onEdit,
}: SortableProjectItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? "bg-indigo-50 text-indigo-600"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      <Link
        href={`/projects/${project.id}`}
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: project.color }}
        />
        <span className="truncate">{project.name}</span>
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault();
          onEdit(project);
        }}
        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-500 transition-all flex-shrink-0"
        aria-label={`Edit ${project.name}`}
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}

export default function Sidebar({ children }: SidebarProps) {
  const pathname = usePathname();
  const { state, dispatch } = useApp();
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showTagManager, setShowTagManager] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Filter out archived projects and sort by displayOrder
  const activeProjects = state.projects
    .filter((p) => !p.archived)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activeProjects.findIndex((p) => p.id === active.id);
      const newIndex = activeProjects.findIndex((p) => p.id === over.id);

      const reorderedProjects = arrayMove(activeProjects, oldIndex, newIndex);
      const projectIds = reorderedProjects.map((p) => p.id);

      dispatch({
        type: "REORDER_PROJECTS",
        payload: projectIds,
      });
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Fixed Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
        {/* Logo */}
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Jaime's Dashboard
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
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

          {/* Manage Tags */}
          <button
            onClick={() => setShowTagManager(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors w-full"
          >
            <Tags size={18} />
            Manage Tags
          </button>

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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={activeProjects.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {activeProjects.map((project) => (
                    <SortableProjectItem
                      key={project.id}
                      project={project}
                      isActive={pathname === `/projects/${project.id}`}
                      onEdit={setEditingProject}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Misc Tasks Section */}
          <MiscTasks />
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

      {editingProject && (
        <ProjectEditModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
        />
      )}

      {showTagManager && (
        <TagManager onClose={() => setShowTagManager(false)} />
      )}
    </div>
  );
}
