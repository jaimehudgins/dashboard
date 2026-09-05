"use client";

import { Building2, CheckCircle2, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface TemuTouchpointPreview {
  source: "email" | "meeting";
  partner: { id: string; name: string };
  contact: { id: string; name: string } | null;
  data: {
    partner_id: string;
    source_external_id: string;
    source_created_at: string;
    source_metadata: Record<string, unknown>;
    contact_id?: string;
    date: string;
    author: string;
    title: string;
    notes: string;
    next_steps: string | null;
    type: "Email" | "Meeting";
  };
  suggested_tasks: Array<{
    source_external_id: string;
    task: string;
    owner: string;
    ownership: "jaime" | "partner" | "unknown";
    dueDate: string | null;
    selected: boolean;
  }>;
}

type SuggestedTask = TemuTouchpointPreview["suggested_tasks"][number];

type ExportResult = {
  duplicate: boolean;
  tasksRequested: number;
  tasksCreated: number;
  taskDuplicates: number;
};

export default function TemuTouchpointModal({
  preview,
  onClose,
}: {
  preview: TemuTouchpointPreview;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(preview.data.title);
  const [date, setDate] = useState(preview.data.date);
  const [notes, setNotes] = useState(preview.data.notes);
  const [nextSteps, setNextSteps] = useState(preview.data.next_steps ?? "");
  const [tasks, setTasks] = useState<SuggestedTask[]>(preview.suggested_tasks);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(preview.data.title);
    setDate(preview.data.date);
    setNotes(preview.data.notes);
    setNextSteps(preview.data.next_steps ?? "");
    setTasks(preview.suggested_tasks);
    setSaving(false);
    setResult(null);
    setError(null);
  }, [preview]);

  const updateTask = (index: number, patch: Partial<SuggestedTask>) => {
    setTasks((current) =>
      current.map((task, taskIndex) =>
        taskIndex === index ? { ...task, ...patch } : task,
      ),
    );
  };

  const save = async () => {
    if (!title.trim() || !notes.trim() || !date) return;
    const selectedTasks = tasks.filter(
      (task) => task.selected && task.task.trim(),
    );
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/temu/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "touchpoints",
          confirmed: true,
          data: {
            ...preview.data,
            date,
            title: title.trim(),
            notes: notes.trim(),
            next_steps: nextSteps.trim() || null,
          },
          follow_up_tasks: selectedTasks.map((task) => ({
            source_external_id: task.source_external_id,
            task: task.task.trim(),
            owner: task.owner,
            ownership: task.ownership,
            due_date: task.dueDate || null,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "TEMU export failed");
      setResult({
        duplicate: Boolean(body.duplicate),
        tasksRequested: body.follow_up_tasks?.requested ?? 0,
        tasksCreated: body.follow_up_tasks?.created ?? 0,
        taskDuplicates: body.follow_up_tasks?.duplicates ?? 0,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "TEMU export failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <Building2 size={17} className="text-emerald-600" />
              Add {preview.data.type.toLowerCase()} to TEMU
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Review everything below. Nothing is added until you confirm.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
            <p className="text-sm font-medium text-emerald-900">
              {preview.partner.name}
            </p>
            <p className="text-xs text-emerald-700">
              {preview.contact
                ? `Matched contact: ${preview.contact.name}`
                : "Partner matched; no existing contact was linked."}
            </p>
          </div>

          <div className="grid grid-cols-[1fr_9rem] gap-3">
            <label className="text-xs font-medium text-slate-600">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Date
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-slate-600">
            TEMU summary
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={7}
              className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Next steps
            <textarea
              value={nextSteps}
              onChange={(event) => setNextSteps(event.target.value)}
              rows={4}
              placeholder="No next steps identified"
              className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>

          <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-800">
                Tasks for Work
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Jaime-owned actions are selected automatically. Partner-owned
                actions stay in the touchpoint unless you select them as waiting.
              </p>
            </div>

            {tasks.length === 0 ? (
              <p className="text-xs text-slate-500">
                Leo did not find a clear action to add to Work.
              </p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task, index) => (
                  <div
                    key={task.source_external_id}
                    className={`rounded-lg border p-3 ${
                      task.selected
                        ? "border-indigo-200 bg-white"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={task.selected}
                        onChange={(event) =>
                          updateTask(index, { selected: event.target.checked })
                        }
                        className="mt-2 h-4 w-4 rounded border-slate-300 text-indigo-600"
                        aria-label={`Add ${task.task} to Work`}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          value={task.task}
                          onChange={(event) =>
                            updateTask(index, { task: event.target.value })
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={task.ownership}
                            onChange={(event) =>
                              updateTask(index, {
                                ownership: event.target
                                  .value as SuggestedTask["ownership"],
                              })
                            }
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              task.ownership === "jaime"
                                ? "bg-indigo-50 text-indigo-700"
                                : task.ownership === "partner"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            <option value="jaime">Jaime owns</option>
                            <option value="partner">Partner owns</option>
                            <option value="unknown">Owner unclear</option>
                          </select>
                          {task.owner && (
                            <span className="text-xs text-slate-500">
                              {task.owner}
                            </span>
                          )}
                          <input
                            type="date"
                            value={task.dueDate ?? ""}
                            onChange={(event) =>
                              updateTask(index, {
                                dueDate: event.target.value || null,
                              })
                            }
                            className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                            aria-label={`Due date for ${task.task}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 size={16} />
              <span>
                {result.duplicate
                  ? "This touchpoint was already in TEMU."
                  : "Touchpoint added to TEMU."}
                {result.tasksRequested > 0 && (
                  <>
                    {" "}
                    {result.tasksCreated > 0
                      ? `${result.tasksCreated} task${result.tasksCreated === 1 ? "" : "s"} added to Work.`
                      : `${result.taskDuplicates} selected task${result.taskDuplicates === 1 ? " was" : "s were"} already there.`}
                  </>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-5">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {result ? "Done" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={save}
              disabled={saving || !title.trim() || !notes.trim() || !date}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Building2 size={15} />}
              {saving ? "Adding…" : "Confirm and add"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
