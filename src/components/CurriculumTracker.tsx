"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  BarChart3,
} from "lucide-react";
import { CurriculumLesson, CurriculumLessonStatus } from "@/types";
import {
  fetchCurriculumLessons,
  updateCurriculumLessonStatus,
} from "@/lib/database";

const STATUS_OPTIONS: CurriculumLessonStatus[] = [
  "Not Created",
  "Needs Updating",
  "Generated",
  "Complete",
];

const STATUS_COLORS: Record<CurriculumLessonStatus, string> = {
  "Not Created": "bg-gray-100 text-gray-700 border-gray-200",
  "Needs Updating": "bg-amber-50 text-amber-700 border-amber-200",
  Generated: "bg-blue-50 text-blue-700 border-blue-200",
  Complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_DOT_COLORS: Record<CurriculumLessonStatus, string> = {
  "Not Created": "bg-gray-400",
  "Needs Updating": "bg-amber-400",
  Generated: "bg-blue-400",
  Complete: "bg-emerald-400",
};

const GRADES = ["9th", "10th", "11th", "12th"];

interface UnitGroup {
  unitNumber: number;
  unitName: string;
  format: string;
  lessons: CurriculumLesson[];
}

export default function CurriculumTracker() {
  const [lessons, setLessons] = useState<CurriculumLesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeGrade, setActiveGrade] = useState("9th");
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadLessons();
  }, []);

  const loadLessons = async () => {
    try {
      setIsLoading(true);
      const data = await fetchCurriculumLessons();
      setLessons(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load curriculum data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = useCallback(
    async (lessonId: string, newStatus: CurriculumLessonStatus) => {
      setLessons((prev) =>
        prev.map((l) => (l.id === lessonId ? { ...l, status: newStatus } : l)),
      );
      try {
        await updateCurriculumLessonStatus(lessonId, newStatus);
      } catch {
        loadLessons();
      }
    },
    [],
  );

  const toggleUnit = useCallback((unitKey: string) => {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitKey)) {
        next.delete(unitKey);
      } else {
        next.add(unitKey);
      }
      return next;
    });
  }, []);

  // Group lessons by grade -> format+unit
  const unitsByGrade = useMemo(() => {
    const grouped: Record<string, UnitGroup[]> = {};
    for (const grade of GRADES) {
      const gradeLessons = lessons.filter((l) => l.grade === grade);
      const unitMap = new Map<string, UnitGroup>();

      for (const lesson of gradeLessons) {
        const key = `${lesson.format}::${lesson.unitNumber}`;
        if (!unitMap.has(key)) {
          unitMap.set(key, {
            unitNumber: lesson.unitNumber,
            unitName: lesson.unitName,
            format: lesson.format,
            lessons: [],
          });
        }
        unitMap.get(key)!.lessons.push(lesson);
      }

      // Sort: 50-min units first, then 30-min, within each by unit number
      const units = Array.from(unitMap.values()).sort((a, b) => {
        if (a.format !== b.format) {
          return a.format.includes("50") ? -1 : 1;
        }
        return a.unitNumber - b.unitNumber;
      });

      grouped[grade] = units;
    }
    return grouped;
  }, [lessons]);

  // Stats
  const stats = useMemo(() => {
    const gradeLessons = lessons.filter((l) => l.grade === activeGrade);
    const total = gradeLessons.length;
    const complete = gradeLessons.filter((l) => l.status === "Complete").length;
    const generated = gradeLessons.filter((l) => l.status === "Generated").length;
    const needsUpdating = gradeLessons.filter(
      (l) => l.status === "Needs Updating",
    ).length;
    const notCreated = gradeLessons.filter(
      (l) => l.status === "Not Created",
    ).length;
    return { total, complete, generated, needsUpdating, notCreated };
  }, [lessons, activeGrade]);

  const overallStats = useMemo(() => {
    const total = lessons.length;
    const complete = lessons.filter((l) => l.status === "Complete").length;
    const generated = lessons.filter((l) => l.status === "Generated").length;
    const needsUpdating = lessons.filter(
      (l) => l.status === "Needs Updating",
    ).length;
    const notCreated = lessons.filter(
      (l) => l.status === "Not Created",
    ).length;
    return { total, complete, generated, needsUpdating, notCreated };
  }, [lessons]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p className="font-medium">Error loading curriculum data</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <GraduationCap className="h-6 w-6" />
          Curriculum Tracker
        </h1>
        <p className="mt-1 text-slate-500">
          Track lesson creation progress across all grades and formats
        </p>
      </div>

      {/* Overall Progress Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">
            Overall Progress
          </h3>
          <span className="text-sm text-slate-500">
            {overallStats.complete}/{overallStats.total} lessons complete
          </span>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
          {overallStats.complete > 0 && (
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{
                width: `${(overallStats.complete / overallStats.total) * 100}%`,
              }}
            />
          )}
          {overallStats.generated > 0 && (
            <div
              className="bg-blue-400 transition-all duration-500"
              style={{
                width: `${(overallStats.generated / overallStats.total) * 100}%`,
              }}
            />
          )}
          {overallStats.needsUpdating > 0 && (
            <div
              className="bg-amber-400 transition-all duration-500"
              style={{
                width: `${(overallStats.needsUpdating / overallStats.total) * 100}%`,
              }}
            />
          )}
        </div>
        <div className="flex gap-6 mt-3">
          <StatusBadge label="Complete" count={overallStats.complete} color="emerald" />
          <StatusBadge label="Generated" count={overallStats.generated} color="blue" />
          <StatusBadge label="Needs Updating" count={overallStats.needsUpdating} color="amber" />
          <StatusBadge label="Not Created" count={overallStats.notCreated} color="gray" />
        </div>
      </div>

      {/* Grade Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {GRADES.map((grade) => {
          const gradeLessons = lessons.filter((l) => l.grade === grade);
          const completeCount = gradeLessons.filter(
            (l) => l.status === "Complete",
          ).length;
          return (
            <button
              key={grade}
              onClick={() => setActiveGrade(grade)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeGrade === grade
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {grade} Grade
              <span className="ml-2 text-xs text-slate-400">
                {completeCount}/{gradeLessons.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Grade Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Complete"
          count={stats.complete}
          total={stats.total}
          color="emerald"
        />
        <StatCard
          label="Generated"
          count={stats.generated}
          total={stats.total}
          color="blue"
        />
        <StatCard
          label="Needs Updating"
          count={stats.needsUpdating}
          total={stats.total}
          color="amber"
        />
        <StatCard
          label="Not Created"
          count={stats.notCreated}
          total={stats.total}
          color="gray"
        />
      </div>

      {/* Units */}
      <div className="space-y-3">
        {(unitsByGrade[activeGrade] || []).map((unit) => {
          const unitKey = `${activeGrade}-${unit.format}-${unit.unitNumber}`;
          const isExpanded = expandedUnits.has(unitKey);
          const unitComplete = unit.lessons.filter(
            (l) => l.status === "Complete",
          ).length;
          const unitGenerated = unit.lessons.filter(
            (l) => l.status === "Generated",
          ).length;

          // Extract short unit name
          const shortName = unit.unitName.split("|")[0].trim();
          const formatLabel = unit.format.includes("50")
            ? "50-Min Seminar"
            : "30-Min Advisory";

          return (
            <div
              key={unitKey}
              className="bg-white border border-slate-200 rounded-lg overflow-hidden"
            >
              {/* Unit Header */}
              <button
                onClick={() => toggleUnit(unitKey)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronRight size={18} className="text-slate-400 flex-shrink-0" />
                )}
                <BookOpen size={18} className="text-indigo-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 truncate">
                      {shortName}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0">
                      {formatLabel}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-slate-500">
                    {unitComplete + unitGenerated}/{unit.lessons.length}
                  </span>
                  {/* Mini progress bar */}
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                    {unitComplete > 0 && (
                      <div
                        className="bg-emerald-500"
                        style={{
                          width: `${(unitComplete / unit.lessons.length) * 100}%`,
                        }}
                      />
                    )}
                    {unitGenerated > 0 && (
                      <div
                        className="bg-blue-400"
                        style={{
                          width: `${(unitGenerated / unit.lessons.length) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Lessons */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  {/* Table Header */}
                  <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_1fr_1fr_140px] gap-2 px-5 py-2.5 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <div>Lesson</div>
                    <div>Title</div>
                    <div>Description</div>
                    <div>Durable Skill</div>
                    <div>Work Product</div>
                    <div>Platform Action</div>
                    <div>Alma Integration</div>
                    <div>Status</div>
                  </div>

                  {/* Lesson Rows */}
                  {unit.lessons.map((lesson, idx) => (
                    <div
                      key={lesson.id}
                      className={`grid grid-cols-[60px_1fr_1fr_1fr_1fr_1fr_1fr_140px] gap-2 px-5 py-3 text-sm border-t border-slate-50 hover:bg-slate-50/50 transition-colors ${
                        idx % 2 === 0 ? "" : "bg-slate-25"
                      }`}
                    >
                      <div className="font-medium text-indigo-600">
                        {lesson.lessonNumber}
                      </div>
                      <div className="font-medium text-slate-900 line-clamp-2">
                        {lesson.title}
                      </div>
                      <div className="text-slate-600 text-xs line-clamp-3">
                        {lesson.description}
                      </div>
                      <div className="text-slate-600 text-xs">
                        {lesson.durableSkill || "—"}
                      </div>
                      <div className="text-slate-600 text-xs line-clamp-2">
                        {lesson.studentWorkProduct || "—"}
                      </div>
                      <div className="text-slate-600 text-xs">
                        {lesson.platformAction || "—"}
                      </div>
                      <div className="text-slate-600 text-xs line-clamp-2">
                        {lesson.almaIntegration || "—"}
                      </div>
                      <div>
                        <select
                          value={lesson.status}
                          onChange={(e) =>
                            handleStatusChange(
                              lesson.id,
                              e.target.value as CurriculumLessonStatus,
                            )
                          }
                          className={`w-full text-xs font-medium px-2 py-1.5 rounded-md border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${STATUS_COLORS[lesson.status]}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  const dotColor =
    color === "emerald"
      ? "bg-emerald-400"
      : color === "blue"
        ? "bg-blue-400"
        : color === "amber"
          ? "bg-amber-400"
          : "bg-gray-400";

  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-600">
      <div className={`w-2 h-2 rounded-full ${dotColor}`} />
      <span>
        {count} {label}
      </span>
    </div>
  );
}

function StatCard({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  const bgColor =
    color === "emerald"
      ? "bg-emerald-50 border-emerald-200"
      : color === "blue"
        ? "bg-blue-50 border-blue-200"
        : color === "amber"
          ? "bg-amber-50 border-amber-200"
          : "bg-gray-50 border-gray-200";
  const textColor =
    color === "emerald"
      ? "text-emerald-700"
      : color === "blue"
        ? "text-blue-700"
        : color === "amber"
          ? "text-amber-700"
          : "text-gray-700";

  return (
    <div className={`rounded-lg border p-4 ${bgColor}`}>
      <div className={`text-2xl font-bold ${textColor}`}>{count}</div>
      <div className="text-xs text-slate-600 mt-1">
        {label} ({percentage}%)
      </div>
    </div>
  );
}
