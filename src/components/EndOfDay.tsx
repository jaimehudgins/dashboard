"use client";

import React, { useState, useEffect, useMemo } from "react";
import { format, startOfDay, addDays, isSameDay } from "date-fns";
import {
  Trophy,
  Clock,
  CheckCircle2,
  Flame,
  TrendingUp,
  Target,
  Award,
  Sunset,
  CircleDot,
  ArrowRight,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";

const PRIORITY_RANK: Record<Task["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

interface EndOfDayProps {
  onOpenZenMode?: (task: Task) => void;
}

export default function EndOfDay({ onOpenZenMode }: EndOfDayProps) {
  const { state, getTodayFocusMinutes, getMomentumScore } = useApp();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const focusMinutes = getTodayFocusMinutes();
  const momentum = getMomentumScore();
  const completedToday = state.completedToday;

  const projectBreakdown = useMemo(
    () =>
      state.projects
        .map((project) => {
          const todaySessions = state.focusSessions.filter(
            (s) =>
              s.projectId === project.id &&
              new Date(s.startTime).toDateString() ===
                new Date().toDateString(),
          );
          const minutes = todaySessions.reduce((acc, s) => acc + s.minutes, 0);
          const completedCount = completedToday.filter(
            (t) => t.projectId === project.id,
          ).length;
          return { ...project, todayMinutes: minutes, completedCount };
        })
        .filter((p) => p.todayMinutes > 0 || p.completedCount > 0),
    [state.projects, state.focusSessions, completedToday],
  );

  // Active (open) tasks, excluding subtasks.
  const activeTasks = useMemo(
    () =>
      state.tasks.filter(
        (t) => t.status !== "completed" && !t.parentTaskId,
      ),
    [state.tasks],
  );

  // Tomorrow preview: tasks due tomorrow.
  const tomorrowTasks = useMemo(() => {
    const tomorrow = startOfDay(addDays(new Date(), 1));
    return activeTasks
      .filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), tomorrow))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  }, [activeTasks]);

  // Top 3 open loops: in-progress first, then overdue, then by priority.
  const openLoops = useMemo(() => {
    const today = startOfDay(new Date());
    const score = (t: Task) => {
      const inProgress = t.status === "in_progress" ? 0 : 1;
      const overdue =
        t.dueDate && startOfDay(new Date(t.dueDate)) < today ? 0 : 1;
      return inProgress * 100 + overdue * 10 + PRIORITY_RANK[t.priority];
    };
    return [...activeTasks].sort((a, b) => score(a) - score(b)).slice(0, 3);
  }, [activeTasks]);

  const getMomentumLevel = (s: number) => {
    if (s >= 80) return { label: "On Fire!", color: "text-orange-600", icon: Flame };
    if (s >= 60) return { label: "Strong", color: "text-green-600", icon: TrendingUp };
    if (s >= 40) return { label: "Building", color: "text-yellow-600", icon: Target };
    return { label: "Starting", color: "text-slate-500", icon: Target };
  };
  const momentumLevel = getMomentumLevel(momentum);
  const MomentumIcon = momentumLevel.icon;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center">
          <Sunset className="text-amber-500" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">How did today go?</h1>
          <p className="text-slate-500 mt-0.5">
            Your work receipt for{" "}
            {mounted ? format(new Date(), "EEEE, MMMM d, yyyy") : " "}
          </p>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-200 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-green-600">Completed</p>
              <p className="text-3xl font-bold text-slate-900">
                {completedToday.length}
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-500">tasks finished today</p>
        </div>

        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-indigo-200 rounded-xl flex items-center justify-center">
              <Clock className="text-indigo-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-indigo-600">Deep Work</p>
              <p className="text-3xl font-bold text-slate-900">{focusMinutes}m</p>
            </div>
          </div>
          <p className="text-sm text-slate-500">of focused time</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-orange-200 rounded-xl flex items-center justify-center">
              <MomentumIcon className="text-orange-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-orange-600">Momentum</p>
              <p className="text-3xl font-bold text-slate-900">{momentum}%</p>
            </div>
          </div>
          <p className={`text-sm ${momentumLevel.color}`}>{momentumLevel.label}</p>
        </div>
      </div>

      {/* Project Breakdown */}
      {projectBreakdown.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Project Breakdown
          </h3>
          <div className="space-y-4">
            {projectBreakdown.map((project) => (
              <div key={project.id} className="flex items-center gap-4">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-slate-900 font-medium">
                    {project.name}
                  </span>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    {project.completedCount > 0 && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 size={14} className="text-green-500" />
                        {project.completedCount} done
                      </span>
                    )}
                    {project.todayMinutes > 0 && (
                      <span className="flex items-center gap-1">
                        <Flame size={14} className="text-orange-500" />
                        {project.todayMinutes}m
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Wins */}
      {completedToday.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Trophy className="text-yellow-500" size={20} />
            Today&rsquo;s Wins
          </h3>
          <div className="space-y-3">
            {completedToday.map((task) => {
              const project = state.projects.find(
                (p) => p.id === task.projectId,
              );
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                >
                  <CheckCircle2 size={18} className="text-green-500" />
                  <span className="text-slate-900 flex-1">{task.title}</span>
                  {project && (
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="text-xs text-slate-500">
                        {project.name}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Open loops + Tomorrow preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 3 open loops */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
            <CircleDot className="text-rose-500" size={20} />
            Open Loops
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            The few things still pulling at your attention.
          </p>
          {openLoops.length > 0 ? (
            <div className="space-y-2">
              {openLoops.map((task) => {
                const project = state.projects.find(
                  (p) => p.id === task.projectId,
                );
                return (
                  <button
                    key={task.id}
                    onClick={() => onOpenZenMode?.(task)}
                    className="w-full flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg text-left transition-colors"
                  >
                    <CircleDot size={16} className="text-rose-400 flex-shrink-0" />
                    <span className="text-slate-900 flex-1 truncate">
                      {task.title}
                    </span>
                    {project && (
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {project.name}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-4">
              Nothing open. Inbox zero on the mind.
            </p>
          )}
        </div>

        {/* Tomorrow preview */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
            <ArrowRight className="text-indigo-500" size={20} />
            Tomorrow
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            {mounted
              ? format(addDays(new Date(), 1), "EEEE, MMMM d")
              : " "}
          </p>
          {tomorrowTasks.length > 0 ? (
            <div className="space-y-2">
              {tomorrowTasks.map((task) => {
                const project = state.projects.find(
                  (p) => p.id === task.projectId,
                );
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                  >
                    <Clock size={16} className="text-indigo-400 flex-shrink-0" />
                    <span className="text-slate-900 flex-1 truncate">
                      {task.title}
                    </span>
                    {project && (
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {project.name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-4">
              Nothing due tomorrow. A clear runway.
            </p>
          )}
        </div>
      </div>

      {/* Empty State */}
      {completedToday.length === 0 && focusMinutes === 0 && (
        <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-12 text-center">
          <Award className="mx-auto text-slate-400 mb-4" size={48} />
          <h3 className="text-slate-900 font-medium mb-2">
            No receipt yet today
          </h3>
          <p className="text-sm text-slate-500">
            Complete tasks and log focus time to close the day out.
          </p>
        </div>
      )}
    </div>
  );
}
