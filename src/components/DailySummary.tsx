"use client";

import React from "react";
import { format } from "date-fns";
import {
  Trophy,
  Clock,
  CheckCircle2,
  Flame,
  TrendingUp,
  Target,
  Award,
} from "lucide-react";
import { useApp } from "@/store/store";

export default function DailySummary() {
  const { state, getTodayFocusMinutes, getMomentumScore } = useApp();

  const focusMinutes = getTodayFocusMinutes();
  const momentum = getMomentumScore();
  const completedToday = state.completedToday;

  const projectBreakdown = state.projects
    .map((project) => {
      const todaySessions = state.focusSessions.filter(
        (s) =>
          s.projectId === project.id &&
          new Date(s.startTime).toDateString() === new Date().toDateString(),
      );
      const minutes = todaySessions.reduce((acc, s) => acc + s.minutes, 0);
      const completedTasks = completedToday.filter(
        (t) => t.projectId === project.id,
      );

      return {
        ...project,
        todayMinutes: minutes,
        completedCount: completedTasks.length,
      };
    })
    .filter((p) => p.todayMinutes > 0 || p.completedCount > 0);

  const getMomentumLevel = (score: number) => {
    if (score >= 80)
      return { label: "On Fire!", color: "text-orange-600", icon: Flame };
    if (score >= 60)
      return { label: "Strong", color: "text-green-600", icon: TrendingUp };
    if (score >= 40)
      return { label: "Building", color: "text-yellow-600", icon: Target };
    return { label: "Starting", color: "text-slate-500", icon: Target };
  };

  const momentumLevel = getMomentumLevel(momentum);
  const MomentumIcon = momentumLevel.icon;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Daily Summary</h1>
        <p className="text-slate-500 mt-1">
          Your work receipt for {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-3 gap-6">
        {/* Completed Tasks */}
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

        {/* Focus Time */}
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-indigo-200 rounded-xl flex items-center justify-center">
              <Clock className="text-indigo-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-indigo-600">Deep Work</p>
              <p className="text-3xl font-bold text-slate-900">
                {focusMinutes}m
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-500">of focused time</p>
        </div>

        {/* Momentum Score */}
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
          <p className={`text-sm ${momentumLevel.color}`}>
            {momentumLevel.label}
          </p>
        </div>
      </div>

      {/* Momentum Progress Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            Strategic Momentum
          </h3>
          <span className={`text-sm font-medium ${momentumLevel.color}`}>
            {momentumLevel.label}
          </span>
        </div>
        <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${momentum}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
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
                <div className="flex-1">
                  <div className="flex items-center justify-between">
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Tasks List */}
      {completedToday.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Trophy className="text-yellow-500" size={20} />
            Today's Wins
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
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: project?.color }}
                    />
                    <span className="text-xs text-slate-500">
                      {project?.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {completedToday.length === 0 && focusMinutes === 0 && (
        <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-12 text-center">
          <Award className="mx-auto text-slate-400 mb-4" size={48} />
          <h3 className="text-slate-900 font-medium mb-2">
            Ready to earn your receipt?
          </h3>
          <p className="text-sm text-slate-500">
            Complete tasks and log focus time to build momentum
          </p>
        </div>
      )}
    </div>
  );
}
