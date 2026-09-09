"use client";

import { useEffect, useRef, useState } from "react";
import { readJsonResponse } from "@/lib/http";
import { RESPONSE_CHOICES } from "@/lib/response-needed-policy";
import { REASSESSMENT_SCOPES, reassessmentStatuses, type ReassessmentScope, type ReassessmentResult, type ReassessmentTarget } from "@/types/response-reassessment";
import type { ResponseStatus } from "@/types/partner-response";

type ReviewRow = { target: ReassessmentTarget; result?: ReassessmentResult; error?: string; approved?: boolean };
const endpoint = "/api/partner-responses/reassess";
async function post(body: object) {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await readJsonResponse<{ ok: boolean; result: ReassessmentResult; error: string }>(response);
  if (!response.ok) throw new Error(data.error || "Request failed. Reload before retrying.");
  return data;
}

export default function ResponseReassessment({ enabled, counts }: { enabled: boolean; counts: Partial<Record<ResponseStatus, number>> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const [scope, setScope] = useState<ReassessmentScope>("open");
  const scopeCount = reassessmentStatuses(scope).reduce((total, status) => total + (counts[status] ?? 0), 0);
  const lock = useRef(false);
  const stop = useRef(false);
  const alive = useRef(true);
  const targets = useRef<ReassessmentTarget[]>([]);
  const index = useRef(0);
  const runId = useRef("");
  const runScope = useRef<ReassessmentScope>("open");
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop.current = true; }; }, []);

  async function run(resume = false) {
    if (lock.current) return;
    lock.current = true; stop.current = false;
    setBusy(true); setError(null); setNotice(null); setConfirmClose(false);
    try {
      if (!resume) {
        setRows([]); setSelected([]); setTotal(0); setRemaining(0);
        targets.current = []; index.current = 0; runId.current = crypto.randomUUID(); runScope.current = scope;
        let cursor: string | null = null;
        do {
          const response: Response = await fetch(`${endpoint}?scope=${runScope.current}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
          const page: Partial<{ items: ReassessmentTarget[]; cursor: string | null; error: string }> = await readJsonResponse(response);
          if (!response.ok) throw new Error(page.error || "Could not load conversations.");
          if (!Array.isArray(page.items) || !(page.cursor === null || typeof page.cursor === "string")) throw new Error("Incomplete snapshot response. No assessments started.");
          targets.current.push(...page.items);
          if (page.cursor === cursor && cursor) throw new Error("The snapshot cursor did not advance. No assessments started.");
          cursor = page.cursor;
          if (targets.current.length > 2000) throw new Error("This batch exceeds the 2,000-conversation safety limit. No assessments started.");
          if (!alive.current || stop.current) { targets.current = []; return; }
        } while (cursor);
        setTotal(targets.current.length); setRemaining(targets.current.length);
      }
      while (index.current < targets.current.length && !stop.current && alive.current) {
        const target = targets.current[index.current];
        let row: ReviewRow;
        try {
          const data = await post({ action: "assess", ...target, runId: runId.current, scope: runScope.current });
          if (!data.result) throw new Error("Assessment result was not returned.");
          row = { target, result: data.result };
        } catch (caught) {
          row = { target, error: `${caught instanceof Error ? caught.message : "Assessment failed."} Reload this conversation before retrying; a lost response may have saved an assessment.` };
        }
        index.current++;
        if (alive.current) { setRows((prior) => [...prior, row]); setRemaining(targets.current.length - index.current); }
      }
      if (alive.current) setNotice(index.current < targets.current.length ? "Paused. Resume to continue the remaining conversations." : "Reassessment complete. Review suggestions below; nothing was closed automatically.");
    } catch (caught) {
      targets.current = []; index.current = 0; setRemaining(0);
      if (alive.current) setError(caught instanceof Error ? caught.message : "Could not reassess conversations.");
    } finally {
      lock.current = false;
      if (alive.current) { setBusy(false); window.dispatchEvent(new Event("leo:attention-updated")); }
    }
  }

  async function approveSelected() {
    if (lock.current || !confirmClose) return;
    lock.current = true; stop.current = false;
    setBusy(true); setConfirmClose(false); setError(null);
    let approved = 0;
    try {
      for (const row of rows.filter((row) => row.result?.canClose && !row.approved && selected.includes(row.target.threadId))) {
        if (stop.current || !alive.current) break;
        const result = row.result!;
        try {
          const receipt = await post({ action: "approve", threadId: result.threadId, version: result.version, messageId: result.messageId, runId: runId.current, confirmed: true });
          if (receipt.ok !== true) throw new Error("Closure was not confirmed.");
          approved++;
          if (alive.current) setRows((prior) => prior.map((entry) => entry.target.threadId === result.threadId ? { ...entry, approved: true, error: undefined } : entry));
        } catch (caught) {
          if (alive.current) setRows((prior) => prior.map((entry) => entry.target.threadId === result.threadId ? { ...entry, error: `${caught instanceof Error ? caught.message : "Closure could not be confirmed."} Check the queue before retrying.` } : entry));
        }
        if (alive.current) setSelected((prior) => prior.filter((id) => id !== result.threadId));
      }
      if (alive.current) setNotice(`${approved} conversation${approved === 1 ? "" : "s"} marked no follow-up needed. Any failures are listed below. Nothing sent or archived in Gmail.`);
    } finally {
      lock.current = false;
      if (alive.current) { setBusy(false); window.dispatchEvent(new Event("leo:attention-updated")); }
    }
  }

  return <div className="border-b border-slate-100 px-5 py-4">
    <button onClick={() => setOpen(!open)} aria-expanded={open} className="text-sm font-semibold text-emerald-800">Reassess conversations</button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-sm text-slate-600">Recheck saved partner conversations using the latest emails and response rules, including those archived in Gmail. Drafts and recorded decisions are preserved. Likely resolved threads need your approval to close; no emails, Gmail archives, task changes, or CRM updates.</p>
      <label className="block text-sm font-semibold text-slate-700">Scope
        <select value={scope} disabled={busy || remaining > 0} onChange={(event) => setScope(event.target.value as ReassessmentScope)} className="ml-3 rounded-lg border border-slate-200 bg-white p-2 font-normal disabled:opacity-40">
          {REASSESSMENT_SCOPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {scope === "all" && <p className="text-sm text-amber-800">You’ve included Handled conversations. Existing closures stay protected unless a new partner email has arrived; conflicting suggestions are flagged for individual review.</p>}
      <p className="text-xs text-slate-500">{scopeCount} conversations in this scope. Each assessment uses Claude and can take a minute or more. Keep this page open; Stop finishes the current request. Saved assessments remain in Attention, but this batch list is lost on refresh.</p>
      {!enabled && <p className="text-sm text-amber-800">Complete response-policy setup and enable the model before starting.</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy || !enabled || scopeCount === 0} onClick={() => void run()} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40">Start new reassessment</button>
        {remaining > 0 && !busy && <button disabled={!enabled} onClick={() => void run(true)} className="rounded-lg border px-3 py-2 text-sm">Resume {remaining} remaining</button>}
        {busy && <button onClick={() => { stop.current = true; setNotice("Stopping after the current request…"); }} className="rounded-lg border px-3 py-2 text-sm">Stop after current</button>}
      </div>
      {total > 0 && <p role="status" className="text-sm text-slate-600">{rows.length} of {total} assessed or attempted · {rows.filter((row) => row.result?.protectedDecision).length} protected · {rows.filter((row) => row.error).length} errors</p>}
      {busy && total === 0 && <p role="status" className="text-sm text-slate-500">Collecting conversations across all pages in the selected scope…</p>}
      {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
      {rows.length > 0 && <div className="max-h-96 divide-y overflow-y-auto rounded-xl border border-slate-200">
        {rows.map((row) => <div key={row.target.threadId} className="space-y-1 p-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" disabled={busy || !row.result?.canClose || row.approved || Boolean(row.error)} checked={selected.includes(row.target.threadId)} onChange={(event) => { setConfirmClose(false); setSelected((prior) => event.target.checked ? [...prior, row.target.threadId] : prior.filter((id) => id !== row.target.threadId)); }} className="mt-1" />
            <span><span className="font-semibold">{row.result?.partner} {row.result?.subject || row.target.threadId}</span><br />
              {row.approved ? "Marked no follow-up needed" : row.result ? RESPONSE_CHOICES.find(([key]) => key === row.result?.decision)?.[1] : "Assessment failed"}
              {row.result?.protectedDecision && " · Your saved decision was preserved; review individually to change it."}
            </span>
          </label>
          {row.result && <p className="text-slate-600">{row.result.reason}</p>}
          {row.error && <p role="alert" className="text-amber-800">{row.error}</p>}
          <a href={`/mail?thread=${encodeURIComponent(row.target.threadId)}`} target="_blank" rel="noopener noreferrer" className="text-emerald-800 underline">Review email conversation</a>
        </div>)}
      </div>}
      {rows.some((row) => row.result?.canClose && !row.approved) && <div className="space-y-2">
        <button disabled={busy || selected.length === 0} onClick={() => setConfirmClose(true)} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Approve selected as no follow-up needed ({selected.length})</button>
        {confirmClose && <div className="rounded-lg bg-amber-50 p-3 text-sm">
          <p>Mark these {selected.length} conversations Handled and clear their follow-up dates? Notes and drafts are retained. Leo will check for newer emails before each update.</p>
          <button disabled={busy} onClick={() => void approveSelected()} className="mr-4 mt-2 font-semibold text-emerald-800">Confirm selected closures</button>
          <button onClick={() => setConfirmClose(false)} className="underline">Cancel</button>
        </div>}
      </div>}
    </div>}
  </div>;
}
