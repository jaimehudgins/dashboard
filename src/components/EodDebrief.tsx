"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { Battery, Check, Loader2, Lightbulb } from "lucide-react";
import { useApp } from "@/store/store";
import { fetchDebrief, saveDebrief } from "@/lib/debrief";
import { addBacklogItem } from "@/lib/backlog";

const ENERGY_LABELS = ["", "Drained", "Low", "Okay", "Good", "Charged"];

export default function EodDebrief() {
  const { dispatch } = useApp();
  const todayYMD = format(new Date(), "yyyy-MM-dd");

  const [energy, setEnergy] = useState<number | null>(null);
  const [wentWell, setWentWell] = useState("");
  const [noteForLater, setNoteForLater] = useState("");
  const [existed, setExisted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchDebrief(todayYMD).then((d) => {
      if (d) {
        setExisted(true);
        setEnergy(d.energy ?? null);
        setWentWell(d.went_well ?? "");
        setNoteForLater(d.note_for_later ?? "");
      }
    });
  }, [todayYMD]);

  const save = async () => {
    setSaving(true);
    try {
      await saveDebrief({ date: todayYMD, energy, wentWell, noteForLater });
      // First save of the day: log the energy reading + park the note.
      if (!existed) {
        if (energy) {
          dispatch({
            type: "ADD_ENERGY_LOG",
            payload: {
              id: crypto.randomUUID(),
              date: new Date(),
              timeSlot: "evening",
              level: energy,
              createdAt: new Date(),
            },
          });
        }
        if (noteForLater.trim()) {
          await addBacklogItem(noteForLater.trim(), "End of Day");
        }
      }
      setExisted(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      /* surfaced by the empty save state; keep it lightweight */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
        <Battery className="text-emerald-500" size={20} />
        Process the day
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        A quick debrief. Takes ten seconds.
      </p>

      {/* Energy */}
      <div className="mb-4">
        <label className="text-xs font-medium text-slate-500">
          Energy right now
        </label>
        <div className="flex items-center gap-2 mt-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setEnergy(energy === n ? null : n)}
              className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                energy === n
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {n}
            </button>
          ))}
          {energy && (
            <span className="text-sm text-slate-500 ml-1">
              {ENERGY_LABELS[energy]}
            </span>
          )}
        </div>
      </div>

      {/* What went well */}
      <div className="mb-3">
        <label className="text-xs font-medium text-slate-500">
          What went well?
        </label>
        <textarea
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
          rows={2}
          placeholder="A win, a good call, something that clicked…"
          className="w-full mt-1.5 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
        />
      </div>

      {/* Note for later */}
      <div className="mb-4">
        <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
          <Lightbulb size={12} className="text-amber-400" />
          Anything to note for later?
        </label>
        <textarea
          value={noteForLater}
          onChange={(e) => setNoteForLater(e.target.value)}
          rows={2}
          placeholder="Goes to your Backlog so it's not lost…"
          className="w-full mt-1.5 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        {existed && !saved && (
          <span className="text-xs text-slate-400">Saved earlier today</span>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : saved ? (
            <Check size={15} />
          ) : null}
          {saved ? "Saved" : existed ? "Update" : "Save"}
        </button>
      </div>
    </div>
  );
}
