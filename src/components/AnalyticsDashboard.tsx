"use client";

import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import {
  Clock,
  Target,
  TrendingUp,
  BarChart3,
  PieChart,
  Calendar,
} from "lucide-react";
import { useApp } from "@/store/store";
import { Task } from "@/types";
import SmartInsights from "./SmartInsights";
import AllTasks from "./AllTasks";

interface AnalyticsDashboardProps {
  onOpenZenMode?: (task: Task) => void;
}

export default function AnalyticsDashboard({
  onOpenZenMode,
}: AnalyticsDashboardProps) {
  const { state, getTodayFocusMinutes, getMomentumScore } = useApp();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const focusMinutes = getTodayFocusMinutes();
  const momentum = getMomentumScore();

  // Calculate work area breakdown
  const workAreaStats = useMemo(() => {
    const stats = new Map<
      string,
      { name: string; minutes: number; color: string }
    >();

    // Get all focus sessions
    state.focusSessions.forEach((session) => {
      const task = state.tasks.find((t) => t.id === session.taskId);
      if (!task || !task.workAreaId) return;

      const workArea = state.workAreas.find((w) => w.id === task.workAreaId);
      if (!workArea) return;

      const existing = stats.get(workArea.id);
      if (existing) {
        existing.minutes += session.minutes;
      } else {
        stats.set(workArea.id, {
          name: workArea.name,
          minutes: session.minutes,
          color: workArea.color,
        });
      }
    });

    return Array.from(stats.values()).sort((a, b) => b.minutes - a.minutes);
  }, [state.focusSessions, state.tasks, state.workAreas]);

  // Calculate project breakdown
  const projectStats = useMemo(() => {
    return state.projects
      .filter((p) => !p.archived)
      .map((project) => ({
        name: project.name,
        minutes: project.totalFocusMinutes,
        color: project.color,
        id: project.id,
      }))
      .filter((p) => p.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
  }, [state.projects]);

  const totalFocusMinutes = useMemo(() => {
    return state.focusSessions.reduce((acc, s) => acc + s.minutes, 0);
  }, [state.focusSessions]);

  const totalSessions = state.focusSessions.length;
  const avgSessionLength = totalSessions > 0 ? Math.round(totalFocusMinutes / totalSessions) : 0;

  // Generate pie chart for work areas
  const generatePieChart = () => {
    if (workAreaStats.length === 0) return null;

    const total = workAreaStats.reduce((sum, item) => sum + item.minutes, 0);
    if (total === 0) return null;

    let currentAngle = -90; // Start at top
    const radius = 80;
    const centerX = 100;
    const centerY = 100;

    return workAreaStats.map((item, index) => {
      const percentage = (item.minutes / total) * 100;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;

      // Calculate path for pie slice
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = centerX + radius * Math.cos(startRad);
      const y1 = centerY + radius * Math.sin(startRad);
      const x2 = centerX + radius * Math.cos(endRad);
      const y2 = centerY + radius * Math.sin(endRad);

      const largeArc = angle > 180 ? 1 : 0;

      const pathData = [
        `M ${centerX} ${centerY}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        "Z",
      ].join(" ");

      currentAngle = endAngle;

      return (
        <g key={item.name}>
          <path
            d={pathData}
            fill={item.color}
            className="hover:opacity-80 transition-opacity cursor-pointer"
          >
            <title>
              {item.name}: {item.minutes}m ({percentage.toFixed(1)}%)
            </title>
          </path>
        </g>
      );
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Command Center</h1>
          <p className="text-slate-500 mt-1">
            {mounted ? format(new Date(), "EEEE, MMMM d, yyyy") : "\u00A0"}
          </p>
        </div>

        {/* Today's Stats */}
        <div className="flex items-center gap-4">
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Clock size={12} />
              Today's Focus
            </div>
            <div className="text-xl font-bold text-slate-900">
              {focusMinutes}m
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Target size={12} />
              Momentum
            </div>
            <div className="text-xl font-bold text-indigo-600">{momentum}%</div>
          </div>
        </div>
      </div>

      {/* Smart Insights */}
      <SmartInsights onFocusTask={onOpenZenMode} />

      {/* All Tasks */}
      <AllTasks onFocusTask={onOpenZenMode} />

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-indigo-200 rounded-xl flex items-center justify-center">
              <Clock className="text-indigo-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-indigo-600">Total Focus Time</p>
              <p className="text-3xl font-bold text-slate-900">
                {totalFocusMinutes}m
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            {(totalFocusMinutes / 60).toFixed(1)} hours of deep work
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-200 rounded-xl flex items-center justify-center">
              <Calendar className="text-purple-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-purple-600">Focus Sessions</p>
              <p className="text-3xl font-bold text-slate-900">
                {totalSessions}
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            Across all projects and tasks
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-200 rounded-xl flex items-center justify-center">
              <TrendingUp className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-green-600">Avg Session</p>
              <p className="text-3xl font-bold text-slate-900">
                {avgSessionLength}m
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            Average focus session length
          </p>
        </div>
      </div>

      {/* Work Area Breakdown */}
      {workAreaStats.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
              <PieChart className="text-purple-500" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Time by Work Area
              </h2>
              <p className="text-sm text-slate-500">
                All-time focus distribution
              </p>
            </div>
          </div>

          <div className="flex items-center gap-12">
            {/* Pie Chart */}
            <div className="flex-shrink-0">
              <svg width="200" height="200" viewBox="0 0 200 200">
                {generatePieChart()}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-3">
              {workAreaStats.map((item) => {
                const total = workAreaStats.reduce(
                  (sum, i) => sum + i.minutes,
                  0
                );
                const percentage = ((item.minutes / total) * 100).toFixed(1);
                return (
                  <div key={item.name} className="flex items-center gap-4">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-900">
                          {item.name}
                        </span>
                        <span className="text-sm text-slate-500">
                          {item.minutes}m ({percentage}%)
                        </span>
                      </div>
                      <div className="mt-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Project Breakdown */}
      {projectStats.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
              <BarChart3 className="text-indigo-500" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Time by Project
              </h2>
              <p className="text-sm text-slate-500">
                All-time focus distribution
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {projectStats.map((project) => {
              const maxMinutes = Math.max(...projectStats.map((p) => p.minutes));
              const percentage = (project.minutes / maxMinutes) * 100;
              return (
                <div key={project.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="text-sm font-medium text-slate-900">
                        {project.name}
                      </span>
                    </div>
                    <span className="text-sm text-slate-500">
                      {project.minutes}m ({(project.minutes / 60).toFixed(1)}h)
                    </span>
                  </div>
                  <div className="h-8 bg-slate-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full flex items-center px-3 text-white text-xs font-medium rounded-lg transition-all"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: project.color,
                        minWidth: project.minutes > 0 ? "60px" : "0",
                      }}
                    >
                      {project.minutes > 0 && `${project.minutes}m`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {workAreaStats.length === 0 && projectStats.length === 0 && (
        <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-12 text-center">
          <BarChart3 className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-slate-900 font-medium mb-2">
            No focus data yet
          </h3>
          <p className="text-sm text-slate-500">
            Start a focus session to see your analytics here
          </p>
        </div>
      )}
    </div>
  );
}
