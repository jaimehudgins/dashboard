"use client";

import { useCallback, useEffect, useState } from "react";
import { readJsonResponse } from "@/lib/http";
import type { PreparationRun } from "@/lib/partner-response-preparation";

export default function PartnerPreparationStatus() {
  const [status, setStatus] = useState<{ enabled: boolean; latest: PreparationRun | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/partner-responses/preparation", { cache: "no-store" });
      const body = await readJsonResponse<{ enabled: boolean; latest: PreparationRun | null; error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "Preparation status unavailable.");
      if (typeof body.enabled !== "boolean") throw new Error("Preparation returned an incomplete status. Reload to try again.");
      setStatus({ enabled: body.enabled, latest: body.latest ?? null }); setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Preparation status unavailable."); }
  }, []);
  useEffect(() => {
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => window.clearInterval(interval);
  }, [load]);
  const prepare = async () => {
    setBusy(true); setReceipt(null); setError(null);
    try {
      const response = await fetch("/api/partner-responses/preparation", { method: "POST" });
      const body = await readJsonResponse<{ error?: string; reason?: string; complete?: boolean; prepared?: number; needsInput?: number; remaining?: number; failed?: number }>(response);
      if (!response.ok) throw new Error(body.error || "Preparation failed.");
      setReceipt(body.reason ?? `${body.prepared ?? 0} drafts ready; ${body.needsInput ?? 0} need your input; ${body.failed ?? 0} could not be prepared.${body.complete ? " Window complete." : ` ${body.remaining ?? 0} remain for the next check.`}`);
      await load();
      window.dispatchEvent(new Event("leo:attention-updated"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Preparation failed."); }
    finally { setBusy(false); }
  };
  const run = status?.latest;
  return <div className="border-b border-slate-100 bg-emerald-50/30 px-5 py-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold text-emerald-900">Reply preparation {status ? status.enabled ? "on" : "off" : "status"}</p>
        <p className="mt-1 text-xs text-slate-600">Weekdays: 8 AM, 11 AM, 2 PM, and 4:45 PM Central. Drafts only; you decide what sends.</p>
      </div>
      {status?.enabled && <button disabled={busy} onClick={() => void prepare()} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50">{busy ? "Preparing…" : "Run current window"}</button>}
    </div>
    {status && !status.enabled && <p className="mt-2 text-xs text-slate-500">Enable after running partner-response-preparation.sql and setting LEO_AUTO_DRAFTS_ENABLED=true on the server. Manual drafting still works.</p>}
    {run && <p className="mt-2 text-xs text-slate-600">Last window: {new Date(run.cutoff_at).toLocaleDateString("en-US", { timeZone: "America/Chicago" })} · {run.window_label} · {run.status} · {run.prepared} drafts ready · {run.needs_input} need input · {run.remaining_thread_ids.length} remaining · {run.failed} failed</p>}
    {run?.last_error && <p className="mt-2 text-xs text-amber-800">Last preparation issue: {run.last_error} Unprepared emails remain in the queue.</p>}
    {receipt && <p role="status" className="mt-2 text-xs text-emerald-800">{receipt}</p>}
    {error && <p role="alert" className="mt-2 text-xs text-amber-800">{error}</p>}
  </div>;
}
