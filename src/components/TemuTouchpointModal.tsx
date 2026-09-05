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
}

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
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<"created" | "duplicate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(preview.data.title);
    setDate(preview.data.date);
    setNotes(preview.data.notes);
    setNextSteps(preview.data.next_steps ?? "");
    setSaving(false);
    setResult(null);
    setError(null);
  }, [preview]);

  const save = async () => {
    if (!title.trim() || !notes.trim() || !date) return;
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
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "TEMU export failed");
      setResult(body.duplicate ? "duplicate" : "created");
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

          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 size={16} />
              {result === "duplicate"
                ? "This touchpoint was already in TEMU. No duplicate was created."
                : "Touchpoint added to TEMU."}
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
