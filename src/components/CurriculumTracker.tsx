"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Plus,
  Trash2,
  X,
  Check,
  MessageSquare,
} from "lucide-react";
import { CurriculumLesson, CurriculumLessonStatus } from "@/types";
import {
  fetchCurriculumLessons,
  updateCurriculumLessonStatus,
  updateCurriculumLesson,
  updateCurriculumLessonNotes,
  createCurriculumLesson,
  deleteCurriculumLesson,
} from "@/lib/database";

const STATUS_OPTIONS: CurriculumLessonStatus[] = [
  "Not Created",
  "Needs Updating",
  "In Progress",
  "Generated",
  "Complete",
];

const STATUS_COLORS: Record<CurriculumLessonStatus, string> = {
  "Not Created": "bg-gray-100 text-gray-700 border-gray-200",
  "Needs Updating": "bg-amber-50 text-amber-700 border-amber-200",
  "In Progress": "bg-purple-50 text-purple-700 border-purple-200",
  Generated: "bg-blue-50 text-blue-700 border-blue-200",
  Complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const GRADES = ["9th", "10th", "11th", "12th"];

interface UnitGroup {
  unitNumber: number;
  unitName: string;
  format: string;
  lessons: CurriculumLesson[];
}

// Inline editable cell component
function EditableCell({
  value,
  onSave,
  className = "",
  multiline = false,
}: {
  value: string;
  onSave: (newValue: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    if (editValue !== value) {
      onSave(editValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
      handleSave();
    }
    if (e.key === "Escape") {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return multiline ? (
      <div className="flex flex-col gap-1">
        <textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditValue(value);
              setIsEditing(false);
            }
          }}
          autoFocus
          rows={3}
          className="w-full bg-white border border-indigo-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>
    ) : (
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        autoFocus
        className="w-full bg-white border border-indigo-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    );
  }

  return (
    <div
      onClick={() => {
        setEditValue(value);
        setIsEditing(true);
      }}
      className={`cursor-pointer hover:bg-indigo-50 rounded px-1 py-0.5 -mx-1 transition-colors ${className}`}
      title="Click to edit"
    >
      {value || <span className="text-slate-300 italic">—</span>}
    </div>
  );
}

function NotesPopover({
  initial,
  onSave,
  onClose,
}: {
  initial: string;
  onSave: (value: string | undefined) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);

  const commit = () => {
    if (value !== initial) onSave(value);
    onClose();
  };

  return (
    <div
      className="absolute right-0 top-full z-30 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue(initial);
            onClose();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
        }}
        placeholder="Add a note for this lesson..."
        autoFocus
        rows={4}
        className="w-full text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
      />
      <div className="flex justify-between items-center mt-1 px-1">
        <span className="text-[10px] text-slate-400">⌘↵ to save · Esc to cancel</span>
        {value && (
          <button
            onClick={() => {
              setValue("");
              onSave(undefined);
              onClose();
            }}
            className="text-[10px] text-slate-400 hover:text-red-500"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export default function CurriculumTracker() {
  const [lessons, setLessons] = useState<CurriculumLesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeGrade, setActiveGrade] = useState("9th");
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [notesOpenId, setNotesOpenId] = useState<string | null>(null);
  const [addingToUnit, setAddingToUnit] = useState<{
    grade: string;
    format: string;
    unitNumber: number;
    unitName: string;
  } | null>(null);

  // New lesson form state
  const [newLessonNumber, setNewLessonNumber] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDurableSkill, setNewDurableSkill] = useState("");
  const [newWorkProduct, setNewWorkProduct] = useState("");
  const [newPlatformAction, setNewPlatformAction] = useState("");
  const [newAlmaIntegration, setNewAlmaIntegration] = useState("");
  const [newPhaseName, setNewPhaseName] = useState("");

  // Standalone new lesson form (for brand new lesson not in existing unit)
  const [newLessonGrade, setNewLessonGrade] = useState("9th");
  const [newLessonFormat, setNewLessonFormat] = useState("");
  const [newLessonUnitNumber, setNewLessonUnitNumber] = useState("");
  const [newLessonUnitName, setNewLessonUnitName] = useState("");

  useEffect(() => {
    loadLessons();
  }, []);

  const loadLessons = async () => {
    try {
      setIsLoading(true);
      const data = await fetchCurriculumLessons();
      setLessons(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load curriculum data",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = useCallback(
    async (lessonId: string, newStatus: CurriculumLessonStatus) => {
      setLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId ? { ...l, status: newStatus } : l,
        ),
      );
      try {
        await updateCurriculumLessonStatus(lessonId, newStatus);
      } catch {
        loadLessons();
      }
    },
    [],
  );

  const handleCellEdit = useCallback(
    async (
      lessonId: string,
      field: keyof CurriculumLesson,
      newValue: string,
    ) => {
      setLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId ? { ...l, [field]: newValue } : l,
        ),
      );
      try {
        const lesson = lessons.find((l) => l.id === lessonId);
        if (!lesson) return;
        await updateCurriculumLesson({ ...lesson, [field]: newValue });
      } catch {
        loadLessons();
      }
    },
    [lessons],
  );

  const handleNotesSave = useCallback(
    async (lessonId: string, notes: string | undefined) => {
      const cleaned = notes && notes.trim() ? notes : undefined;
      setLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId ? { ...l, notes: cleaned } : l,
        ),
      );
      try {
        await updateCurriculumLessonNotes(lessonId, cleaned);
      } catch {
        loadLessons();
      }
    },
    [],
  );

  const handleDeleteLesson = useCallback(
    async (lessonId: string) => {
      if (!confirm("Delete this lesson?")) return;
      setLessons((prev) => prev.filter((l) => l.id !== lessonId));
      try {
        await deleteCurriculumLesson(lessonId);
      } catch {
        loadLessons();
      }
    },
    [],
  );

  const handleAddLessonToUnit = async () => {
    if (!addingToUnit || !newTitle.trim()) return;

    const unitLessons = lessons.filter(
      (l) =>
        l.grade === addingToUnit.grade &&
        l.format === addingToUnit.format &&
        l.unitNumber === addingToUnit.unitNumber,
    );
    const maxOrder = Math.max(...unitLessons.map((l) => l.displayOrder), 0);

    const newLesson: CurriculumLesson = {
      id: `lesson-${Date.now()}`,
      grade: addingToUnit.grade,
      format: addingToUnit.format,
      unitName: addingToUnit.unitName,
      unitNumber: addingToUnit.unitNumber,
      phaseName: newPhaseName || "",
      lessonNumber: newLessonNumber || `${unitLessons.length + 1}`,
      title: newTitle.trim(),
      description: newDescription,
      durableSkill: newDurableSkill,
      studentWorkProduct: newWorkProduct,
      platformAction: newPlatformAction,
      almaIntegration: newAlmaIntegration,
      status: "Not Created",
      displayOrder: maxOrder + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setLessons((prev) => [...prev, newLesson]);
    resetAddForm();

    try {
      await createCurriculumLesson(newLesson);
    } catch {
      loadLessons();
    }
  };

  const handleAddStandaloneLesson = async () => {
    if (!newTitle.trim() || !newLessonFormat || !newLessonUnitNumber) return;

    const unitNum = parseInt(newLessonUnitNumber);
    const maxOrder = Math.max(...lessons.map((l) => l.displayOrder), 0);

    const newLesson: CurriculumLesson = {
      id: `lesson-${Date.now()}`,
      grade: newLessonGrade,
      format: newLessonFormat,
      unitName: newLessonUnitName || `Unit ${unitNum}`,
      unitNumber: unitNum,
      phaseName: newPhaseName || "",
      lessonNumber: newLessonNumber || "1",
      title: newTitle.trim(),
      description: newDescription,
      durableSkill: newDurableSkill,
      studentWorkProduct: newWorkProduct,
      platformAction: newPlatformAction,
      almaIntegration: newAlmaIntegration,
      status: "Not Created",
      displayOrder: maxOrder + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setLessons((prev) => [...prev, newLesson]);
    resetAddForm();
    setShowAddLesson(false);

    try {
      await createCurriculumLesson(newLesson);
    } catch {
      loadLessons();
    }
  };

  const resetAddForm = () => {
    setAddingToUnit(null);
    setNewLessonNumber("");
    setNewTitle("");
    setNewDescription("");
    setNewDurableSkill("");
    setNewWorkProduct("");
    setNewPlatformAction("");
    setNewAlmaIntegration("");
    setNewPhaseName("");
    setNewLessonFormat("");
    setNewLessonUnitNumber("");
    setNewLessonUnitName("");
  };

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
    const complete = gradeLessons.filter(
      (l) => l.status === "Complete",
    ).length;
    const generated = gradeLessons.filter(
      (l) => l.status === "Generated",
    ).length;
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            Curriculum Tracker
          </h1>
          <p className="mt-1 text-slate-500">
            Track lesson creation progress across all grades and formats
          </p>
        </div>
        <button
          onClick={() => setShowAddLesson(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          <Plus size={16} />
          Add Lesson
        </button>
      </div>

      {/* Add Lesson Modal */}
      {showAddLesson && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Add New Lesson
              </h2>
              <button
                onClick={() => {
                  setShowAddLesson(false);
                  resetAddForm();
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Grade *
                  </label>
                  <select
                    value={newLessonGrade}
                    onChange={(e) => setNewLessonGrade(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g} Grade
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Format *
                  </label>
                  <select
                    value={newLessonFormat}
                    onChange={(e) => setNewLessonFormat(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select format...</option>
                    <option value="50-Minute Seminar">50-Minute Seminar</option>
                    <option value="30-Minute Advisory">
                      30-Minute Advisory
                    </option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Unit Number *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newLessonUnitNumber}
                    onChange={(e) => setNewLessonUnitNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Lesson Number
                  </label>
                  <input
                    type="text"
                    value={newLessonNumber}
                    onChange={(e) => setNewLessonNumber(e.target.value)}
                    placeholder="e.g. 1, 2a, 3"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Unit Name
                </label>
                <input
                  type="text"
                  value={newLessonUnitName}
                  onChange={(e) => setNewLessonUnitName(e.target.value)}
                  placeholder="e.g. Financial Literacy"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Phase Name
                </label>
                <input
                  type="text"
                  value={newPhaseName}
                  onChange={(e) => setNewPhaseName(e.target.value)}
                  placeholder="e.g. Phase 1: Introduction"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Lesson title"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Durable Skill
                </label>
                <input
                  type="text"
                  value={newDurableSkill}
                  onChange={(e) => setNewDurableSkill(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Student Work Product
                </label>
                <input
                  type="text"
                  value={newWorkProduct}
                  onChange={(e) => setNewWorkProduct(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Platform Action
                </label>
                <input
                  type="text"
                  value={newPlatformAction}
                  onChange={(e) => setNewPlatformAction(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Alma Integration
                </label>
                <input
                  type="text"
                  value={newAlmaIntegration}
                  onChange={(e) => setNewAlmaIntegration(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={() => {
                    setShowAddLesson(false);
                    resetAddForm();
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddStandaloneLesson}
                  disabled={
                    !newTitle.trim() ||
                    !newLessonFormat ||
                    !newLessonUnitNumber
                  }
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  Add Lesson
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Lesson to Unit Modal */}
      {addingToUnit && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Add Lesson to {addingToUnit.unitName.split("|")[0].trim()}
              </h2>
              <button
                onClick={resetAddForm}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Lesson Number
                  </label>
                  <input
                    type="text"
                    value={newLessonNumber}
                    onChange={(e) => setNewLessonNumber(e.target.value)}
                    placeholder="e.g. 5, 3a"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Phase Name
                  </label>
                  <input
                    type="text"
                    value={newPhaseName}
                    onChange={(e) => setNewPhaseName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Lesson title"
                  autoFocus
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Durable Skill
                </label>
                <input
                  type="text"
                  value={newDurableSkill}
                  onChange={(e) => setNewDurableSkill(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Student Work Product
                </label>
                <input
                  type="text"
                  value={newWorkProduct}
                  onChange={(e) => setNewWorkProduct(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Platform Action
                </label>
                <input
                  type="text"
                  value={newPlatformAction}
                  onChange={(e) => setNewPlatformAction(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Alma Integration
                </label>
                <input
                  type="text"
                  value={newAlmaIntegration}
                  onChange={(e) => setNewAlmaIntegration(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={resetAddForm}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLessonToUnit}
                  disabled={!newTitle.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  Add Lesson
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
          <StatusBadge
            label="Complete"
            count={overallStats.complete}
            color="emerald"
          />
          <StatusBadge
            label="Generated"
            count={overallStats.generated}
            color="blue"
          />
          <StatusBadge
            label="Needs Updating"
            count={overallStats.needsUpdating}
            color="amber"
          />
          <StatusBadge
            label="Not Created"
            count={overallStats.notCreated}
            color="gray"
          />
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
                  <ChevronDown
                    size={18}
                    className="text-slate-400 flex-shrink-0"
                  />
                ) : (
                  <ChevronRight
                    size={18}
                    className="text-slate-400 flex-shrink-0"
                  />
                )}
                <BookOpen
                  size={18}
                  className="text-indigo-500 flex-shrink-0"
                />
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
                <div className="border-t border-slate-100 overflow-x-auto">
                  {/* Table Header */}
                  <div className="grid grid-cols-[50px_minmax(140px,1.5fr)_minmax(120px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_130px_36px_36px] gap-2 px-5 py-2.5 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[1000px]">
                    <div>Lesson</div>
                    <div>Title</div>
                    <div>Description</div>
                    <div>Durable Skill</div>
                    <div>Work Product</div>
                    <div>Platform Action</div>
                    <div>Alma Integration</div>
                    <div>Status</div>
                    <div></div>
                    <div></div>
                  </div>

                  {/* Lesson Rows */}
                  {unit.lessons.map((lesson, idx) => (
                    <div
                      key={lesson.id}
                      className={`group grid grid-cols-[50px_minmax(140px,1.5fr)_minmax(120px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_130px_36px_36px] gap-2 px-5 py-3 text-sm border-t border-slate-50 hover:bg-slate-50/50 transition-colors min-w-[1000px] ${
                        idx % 2 === 0 ? "" : "bg-slate-25"
                      }`}
                    >
                      <div>
                        <EditableCell
                          value={lesson.lessonNumber}
                          onSave={(v) =>
                            handleCellEdit(lesson.id, "lessonNumber", v)
                          }
                          className="font-medium text-indigo-600"
                        />
                      </div>
                      <div>
                        <EditableCell
                          value={lesson.title}
                          onSave={(v) =>
                            handleCellEdit(lesson.id, "title", v)
                          }
                          className="font-medium text-slate-900"
                        />
                      </div>
                      <div className="relative group/desc">
                        <EditableCell
                          value={lesson.description}
                          onSave={(v) =>
                            handleCellEdit(lesson.id, "description", v)
                          }
                          className="text-slate-600 text-xs line-clamp-2"
                          multiline
                        />
                        {lesson.description && lesson.description.length > 60 && (
                          <div className="hidden group-hover/desc:block absolute left-0 top-full z-20 mt-1 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg max-w-sm whitespace-pre-wrap">
                            {lesson.description}
                          </div>
                        )}
                      </div>
                      <div>
                        <EditableCell
                          value={lesson.durableSkill || ""}
                          onSave={(v) =>
                            handleCellEdit(lesson.id, "durableSkill", v)
                          }
                          className="text-slate-600 text-xs"
                        />
                      </div>
                      <div>
                        <EditableCell
                          value={lesson.studentWorkProduct || ""}
                          onSave={(v) =>
                            handleCellEdit(lesson.id, "studentWorkProduct", v)
                          }
                          className="text-slate-600 text-xs"
                        />
                      </div>
                      <div>
                        <EditableCell
                          value={lesson.platformAction || ""}
                          onSave={(v) =>
                            handleCellEdit(lesson.id, "platformAction", v)
                          }
                          className="text-slate-600 text-xs"
                        />
                      </div>
                      <div>
                        <EditableCell
                          value={lesson.almaIntegration || ""}
                          onSave={(v) =>
                            handleCellEdit(lesson.id, "almaIntegration", v)
                          }
                          className="text-slate-600 text-xs"
                        />
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
                      <div className="relative flex items-center justify-center">
                        <button
                          onClick={() =>
                            setNotesOpenId(
                              notesOpenId === lesson.id ? null : lesson.id,
                            )
                          }
                          className={`transition-all ${
                            lesson.notes
                              ? "text-indigo-500"
                              : "text-slate-300 hover:text-indigo-500 opacity-0 group-hover:opacity-100"
                          }`}
                          title={lesson.notes ? "View / edit note" : "Add note"}
                        >
                          <MessageSquare
                            size={14}
                            fill={lesson.notes ? "currentColor" : "none"}
                          />
                        </button>
                        {notesOpenId === lesson.id && (
                          <NotesPopover
                            initial={lesson.notes || ""}
                            onSave={(v) => handleNotesSave(lesson.id, v)}
                            onClose={() => setNotesOpenId(null)}
                          />
                        )}
                      </div>
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleDeleteLesson(lesson.id)}
                          className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete lesson"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add lesson to unit button */}
                  <div className="px-5 py-3 border-t border-slate-100">
                    <button
                      onClick={() =>
                        setAddingToUnit({
                          grade: activeGrade,
                          format: unit.format,
                          unitNumber: unit.unitNumber,
                          unitName: unit.unitName,
                        })
                      }
                      className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-500 transition-colors"
                    >
                      <Plus size={14} />
                      Add lesson to this unit
                    </button>
                  </div>
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
