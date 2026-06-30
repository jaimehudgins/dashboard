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
  Star,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";
import {
  FocusItem,
  fetchFocusItems,
  addFocusItem,
  deleteFocusItem,
} from "@/lib/focus-items";

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
  const { state, getTodayFocusMinutes, getMomentumScore, dispatch } = useApp();
  const [mounted, setMounted] = useState(false);

  // Pick tomorrow's focus: star tasks → they lead tomorrow's Morning Brief.
  const tomorrowStart = startOfDay(addDays(new Date(), 1));
  const isFocusedTomorrow = (t: Task) =>
    !!t.focusDate &&
    startOfDay(new Date(t.focusDate)).getTime() === tomorrowStart.getTime();
  const toggleFocus = (t: Task) =>
    dispatch({
      type: "SET_TASK_FOCUS",
      payload: {
        taskId: t.id,
        focusDate: isFocusedTomorrow(t) ? null : tomorrowStart,
      },
    });

  // Tomorrow's focus: starred tasks + free-form focus notes.
  const tomorrowYMD = format(tomorrowStart, "yyyy-MM-dd");
  const [focusItems, setFocusItems] = useState<FocusItem[]>([]);
  const [noteText, setNoteText] = useState("");
  const [taskSearch, setTaskSearch] = useState("");

  useEffect(() => {
    fetchFocusItems(tomorrowYMD).then(setFocusItems);
  }, [tomorrowYMD]);

  const starredTasks = state.tasks.filter(
    (t) => t.status !== "completed" && !t.parentTaskId && isFocusedTomorrow(t),
  );
  const matchingTasks = taskSearch.trim()
    ? state.tasks
        .filter(
          (t) =>
            t.status !== "completed" &&
            !t.parentTaskId &&
            !isFocusedTomorrow(t) &&
            t.title.toLowerCase().includes(taskSearch.trim().toLowerCase()),
        )
        .slice(0, 6)
    : [];

  const addNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    const item = await addFocusItem(tomorrowYMD, text);
    if (item) setFocusItems((prev) => [...prev, item]);
    setNoteText("");
  };
  const removeNote = async (id: string) => {
    setFocusItems((prev) => prev.filter((i) => i.id !== id));
    await deleteFocusItem(id);
  };

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
            The few things still pulling at your attention. Star one to focus on
            it tomorrow.
          </p>
          {openLoops.length > 0 ? (
            <div className="space-y-2">
              {openLoops.map((task) => {
                const project = state.projects.find(
                  (p) => p.id === task.projectId,
                );
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <button
                      onClick={() => toggleFocus(task)}
                      title="Focus on this tomorrow"
                      className="flex-shrink-0"
                    >
                      <Star
                        size={16}
                        className={
                          isFocusedTomorrow(task)
                            ? "fill-amber-400 text-amber-400"
                            : "text-slate-300 hover:text-amber-400"
                        }
                      />
                    </button>
                    <button
                      onClick={() => onOpenZenMode?.(task)}
                      className="flex-1 flex items-center gap-2 min-w-0 text-left"
                    >
                      <span className="text-slate-900 flex-1 truncate">
                        {task.title}
                      </span>
                      {project && (
                        <span className="text-xs text-slate-500 flex-shrink-0">
                          {project.name}
                        </span>
                      )}
                    </button>
                  </div>
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
                    className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg"
                  >
                    <button
                      onClick={() => toggleFocus(task)}
                      title="Focus on this tomorrow"
                      className="flex-shrink-0"
                    >
                      <Star
                        size={16}
                        className={
                          isFocusedTomorrow(task)
                            ? "fill-amber-400 text-amber-400"
                            : "text-slate-300 hover:text-amber-400"
                        }
                      />
                    </button>
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

      {/* Tomorrow's focus — star any task or jot an intention */}
      <div className="bg-white border border-indigo-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <Star className="text-amber-400 fill-amber-400" size={20} />
          Tomorrow&rsquo;s focus
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          What you&rsquo;ll lead with tomorrow — star any task (even one not due
          for weeks) or add an intention that isn&rsquo;t a task. These show up
          in your Morning Brief.
        </p>

        {/* Current focus */}
        {starredTasks.length > 0 || focusItems.length > 0 ? (
          <div className="space-y-2 mb-5">
            {starredTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg"
              >
                <Star
                  size={15}
                  className="fill-amber-400 text-amber-400 flex-shrink-0"
                />
                <span className="flex-1 text-sm text-slate-800 truncate">
                  {t.title}
                </span>
                <button
                  onClick={() => toggleFocus(t)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                  aria-label="Unstar"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            {focusItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 px-3 py-2.5 bg-indigo-50 border border-indigo-100 rounded-lg"
              >
                <Target size={15} className="text-indigo-400 flex-shrink-0" />
                <span className="flex-1 text-sm text-slate-800">
                  {item.text}
                </span>
                <button
                  onClick={() => removeNote(item.id)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                  aria-label="Remove"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 mb-5">
            Nothing chosen yet. Star a task or add an intention below.
          </p>
        )}

        {/* Add a free-form intention */}
        <div className="flex items-center gap-2 mb-3">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addNote();
            }}
            placeholder="Add an intention (e.g. “Block 2 hours for the board deck”)…"
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            onClick={addNote}
            disabled={!noteText.trim()}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={15} />
            Add
          </button>
        </div>

        {/* Star an existing task */}
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            value={taskSearch}
            onChange={(e) => setTaskSearch(e.target.value)}
            placeholder="Search a task to star…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          {taskSearch.trim() && (
            <div className="mt-1 border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden max-h-52 overflow-y-auto">
              {matchingTasks.length > 0 ? (
                matchingTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      toggleFocus(t);
                      setTaskSearch("");
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-amber-50 transition-colors"
                  >
                    <Star
                      size={14}
                      className="text-slate-300 flex-shrink-0"
                    />
                    <span className="flex-1 text-sm text-slate-700 truncate">
                      {t.title}
                    </span>
                    {t.dueDate && (
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {format(new Date(t.dueDate), "MMM d")}
                      </span>
                    )}
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-slate-400">
                  No matching tasks.
                </p>
              )}
            </div>
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
