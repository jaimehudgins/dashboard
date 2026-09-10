"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArrowLeft, ExternalLink, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { readJsonResponse } from "@/lib/http";
import { isStaleDraft, type MailSyncState, type PartnerResponse, type ResponseStatus } from "@/types/partner-response";
import PartnerPreparationStatus from "./PartnerPreparationStatus";
import PartnerEmailContext from "./PartnerEmailContext";
import PartnerReplySendDialog from "./PartnerReplySendDialog";
import ResponseRulesPanel from "./ResponseRulesPanel";
import ResponseReassessment from "./ResponseReassessment";
import { RESPONSE_CHOICES, type ResponseNeed } from "@/lib/response-needed-policy";
import { isActionNeeded } from "@/lib/partner-response-lane";

const lanes = [
  ["all", "All open"], ["critical", "Critical now"], ["needs_response", "Needs response"],
  ["draft_ready", "Draft ready"], ["action_needed", "Action needed"], ["needs_input", "Needs your input"],
  ["waiting", "Waiting / follow-up"], ["handled", "Handled recently"],
] as const;
type Lane = typeof lanes[number][0];
interface QueueData {
  configured: boolean;
  setup?: string;
  items: PartnerResponse[];
  sync: MailSyncState;
  counts: Record<ResponseStatus, number>;
  laneCounts?: Partial<Record<Lane, number>>;
  hasMore: boolean;
  error?: string;
  policy?: { ready: boolean; enabled?: boolean; error?: string; last_error?: string | null };
}

export default function PartnerResponseQueue() {
  const [data, setData] = useState<QueueData | null>(null);
  const [lane, setLane] = useState<Lane>("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [selected, setSelected] = useState<PartnerResponse | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/partner-responses?lane=${lane}&page=${page}`, { cache: "no-store" });
      const body = await readJsonResponse<QueueData>(response);
      if (!response.ok) throw new Error(body.error || "Could not load partner responses.");
      if (id === requestId.current) { setData(body as QueueData); setError(null); }
    } catch (caught) {
      if (id === requestId.current) setError(caught instanceof Error ? caught.message : "Could not load partner responses.");
    } finally { if (id === requestId.current) setLoading(false); }
  }, [lane, page]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    const updated = () => { void load(); };
    window.addEventListener("leo:attention-updated", updated);
    return () => { window.clearInterval(interval); window.removeEventListener("leo:attention-updated", updated); requestId.current += 1; };
  }, [load]);

  const sync = async () => {
    setSyncing(true); setError(null); setReceipt(null);
    try {
      const response = await fetch("/api/partner-responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
      const body = await readJsonResponse<{ error: string; busy: boolean; changed: number; complete: boolean }>(response);
      if (!response.ok) throw new Error(body.error || "Mail check failed.");
      setReceipt(body.busy ? "A mail check is already running." : body.complete ? `Mail checked. ${body.changed ?? 0} changed conversations processed.` : "Changes saved. More are waiting; check again to continue, or the next scheduled scan will pick them up.");
      await load();
      window.dispatchEvent(new Event("leo:attention-updated"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Mail check failed."); }
    finally { setSyncing(false); }
  };

  return (
    <section id="partner-responses" className="rounded-2xl border border-emerald-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Partner responses</h2>
          <p className="mt-1 text-sm text-slate-500">Saved replies, decisions, and follow-ups in one place.</p>
          {data?.configured && <p className="mt-2 text-xs text-slate-500">
            {data.sync?.last_checked_at ? `Last complete mail check: ${new Date(data.sync.last_checked_at).toLocaleString()}` : "First mail check is pending."}
            {(data.sync?.page_token || data.sync?.pending_thread_ids?.length) ? " · More changes waiting to sync" : ""}
          </p>}
        </div>
        {data?.configured && <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {syncing ? "Checking mail…" : "Check mail"}
        </button>}
      </div>
      {error && <p role="alert" className="m-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error} <button onClick={() => void load()} className="underline">Reload queue</button></p>}
      {data?.sync?.last_error && <p className="m-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Last mail check could not finish: {data.sync.last_error} Your saved work is still here.</p>}
      {receipt && <p role="status" className="px-5 pt-4 text-sm text-emerald-800">{receipt}</p>}
      {data && !data.configured && <p className="p-5 text-sm text-slate-600">The saved partner queue is waiting for setup. {data.setup} Your existing Mail tools remain available.</p>}
      {data?.configured && <>
        <PartnerPreparationStatus />
        <ResponseReassessment enabled={Boolean(data.policy?.ready && data.policy?.enabled)} counts={data.counts ?? {}} />
        {data.policy && !data.policy.ready && <p className="px-5 py-3 text-sm text-amber-800">{data.policy.error} Existing saved replies remain available.</p>}
        {data.policy?.last_error && <p role="alert" className="px-5 py-3 text-sm text-amber-800">Last response assessment: {data.policy.last_error}</p>}
        {!selected && <div className="flex flex-wrap gap-2 p-5" aria-label="Response filters">
          {lanes.map(([key, label]) => <button key={key} aria-pressed={lane === key} onClick={() => { setLane(key); setPage(0); setSelected(null); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${lane === key ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {label}{key !== "all" && key !== "critical" ? ` · ${data.laneCounts?.[key] ?? (key === "action_needed" ? 0 : data.counts?.[key]) ?? 0}` : ""}
          </button>)}
        </div>}
        {selected ? <ResponseEditor key={`${selected.thread_id}:${selected.version}`} item={selected} policyReady={data.policy?.ready} onBack={() => setSelected(null)} onSent={(notice) => { setSelected(null); setReceipt(notice); void load(); window.dispatchEvent(new Event("leo:attention-updated")); }} onSaved={(item, notice) => { setSelected(item); setReceipt(notice ?? "Changes saved."); void load(); window.dispatchEvent(new Event("leo:attention-updated")); }} /> : <>
          {loading && <p className="px-5 pb-3 text-xs text-slate-500">Loading saved responses…</p>}
          {lane === "action_needed" && <p className="px-5 pb-4 text-sm text-slate-600">Work to do, not an email to write. Your saved Action only decisions and Leo’s high-confidence assessments appear here. Open a conversation for the task links.</p>}
          {lane === "needs_input" && <p className="px-5 pb-4 text-sm text-slate-600">Decisions, missing information, and uncertain classifications. Confirmed action-only work appears in Action needed.</p>}
          <div className="divide-y divide-slate-100">
            {data.items?.map((item) => <button key={item.thread_id} onClick={() => setSelected(item)} className="block w-full px-5 py-4 text-left hover:bg-emerald-50/40">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-emerald-800">{item.partner_name}</span>
                {item.urgency === "now" && item.status !== "handled" && <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">Critical</span>}
                <span className="text-slate-500">{isActionNeeded(item) ? "Action needed" : lanes.find(([key]) => key === item.status)?.[1]}</span>
                {isStaleDraft(item) && !["waiting", "handled"].includes(item.status) && <span className="font-semibold text-amber-700">Draft needs updating</span>}
                {item.follow_up_on && <span className="text-amber-800">Follow up {item.follow_up_on}</span>}
              </div>
              <h3 className="mt-2 font-semibold text-slate-900">{item.subject || "No subject"}</h3>
              {item.response_correction?.message_id === item.message_id
                ? <p className="mt-1 text-xs text-emerald-800">Your decision: {RESPONSE_CHOICES.find(([key]) => key === item.response_correction?.decision)?.[1]}{item.response_correction.reason ? ` · ${item.response_correction.reason}` : ""}</p>
                : item.response_assessment?.message_id === item.message_id && <p className="mt-1 text-xs text-emerald-800">Leo suggests: {RESPONSE_CHOICES.find(([key]) => key === item.response_assessment?.decision)?.[1]} · {item.response_assessment.reason}</p>}
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.snippet}</p>
            </button>)}
          </div>
          {!loading && !data.items?.length && <p className="px-5 pb-6 text-sm text-slate-500">{data.sync?.last_checked_at ? "No saved responses in this view." : "Choose Check mail to bring in up to 100 recent inbox conversations. Later checks will follow changes automatically."}</p>}
          <div className="flex justify-between p-5 text-sm">
            <button disabled={page === 0 || loading} onClick={() => setPage(page - 1)} className="text-emerald-800 disabled:opacity-30">Previous</button>
            <span className="text-slate-400">Page {page + 1}</span>
            <button disabled={!data.hasMore || loading} onClick={() => setPage(page + 1)} className="text-emerald-800 disabled:opacity-30">Next</button>
          </div>
        </>}
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Mail is checked every 5 minutes. Response assessments process two conversations per check; larger backlogs take longer. Draft preparation still uses the four scheduled windows. Existing drafts are never replaced by a scheduled run.</p>
      </>}
    </section>
  );
}

function ResponseEditor({ item, policyReady = false, onBack, onSaved, onSent }: { item: PartnerResponse; policyReady?: boolean; onBack: () => void; onSaved: (item: PartnerResponse, notice?: string) => void; onSent: (notice: string) => void }) {
  const [draft, setDraft] = useState(item.draft);
  const [notes, setNotes] = useState(item.notes);
  const [followUp, setFollowUp] = useState(item.follow_up_on ?? "");
  const [status, setStatus] = useState(item.status);
  const correction = item.response_correction?.message_id === item.message_id ? item.response_correction : null;
  const assessment = item.response_assessment?.message_id === item.message_id ? item.response_assessment : null;
  const [decision, setDecision] = useState<ResponseNeed | "">(correction?.decision ?? "");
  const [feedback, setFeedback] = useState(correction?.reason ?? "");
  const correctionDirty = decision !== (correction?.decision ?? "") || feedback !== (correction?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: number; draft: string; saved_at: string }[] | null>(null);
  const [sendItem, setSendItem] = useState<PartnerResponse | null>(null);
  const dirty = draft !== item.draft || notes !== item.notes || followUp !== (item.follow_up_on ?? "") || status !== item.status || correctionDirty;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (makeDraft = false, noFollowUp = false, reviewSend = false) => {
    setBusy(true); setError(null);
    try {
      // Save notes first so research instructions survive a failed draft request.
      const savedStatus = noFollowUp ? "handled" : draft !== item.draft && status === item.status && !["waiting", "handled"].includes(status)
        ? draft.trim() ? "draft_ready" : "needs_response"
        : status;
      const response = await fetch("/api/partner-responses", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        threadId: item.thread_id, version: item.version, notes, follow_up_on: savedStatus === "handled" ? null : followUp || null, status: savedStatus,
        ...(draft !== item.draft ? { draft } : {}),
        ...(policyReady && (noFollowUp || correctionDirty) ? { response_decision: noFollowUp ? "no_reply" : decision || undefined, response_feedback: feedback } : {}),
      }) });
      const saved = await readJsonResponse<{ error: string; item: PartnerResponse }>(response);
      if (!response.ok || !saved.item) throw new Error(saved.error || "Could not save response.");
      if (reviewSend) { setSendItem(saved.item); return; }
      if (noFollowUp) {
        onSaved(saved.item, "No follow-up needed. Saved in Handled recently; a new incoming email will reopen it after the next mail check. Notes and drafts are retained.");
        onBack();
        return;
      }
      if (!makeDraft) { onSaved(saved.item); return; }
      const generated = await fetch("/api/partner-responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", threadId: item.thread_id, version: saved.item.version, notes }) });
      const result = await readJsonResponse<{ error: string; item: PartnerResponse }>(generated);
      if (!generated.ok || !result.item) {
        // Keep the new version usable after an unsuccessful generation.
        onSaved(saved.item, `Notes saved, but Leo could not prepare a draft. ${result.error || "Try again."}`);
        return;
      }
      onSaved(result.item);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save response."); }
    finally { setBusy(false); }
  };

  const loadHistory = async () => {
    try {
      const response = await fetch(`/api/partner-responses?threadId=${encodeURIComponent(item.thread_id)}`);
      const data = await readJsonResponse<{ revisions: { id: number; draft: string; saved_at: string }[]; error: string }>(response);
      if (!response.ok) throw new Error(data.error || "Could not load history.");
      setHistory(data.revisions ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load history."); }
  };

  const recheckReply = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/partner-responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recheck_reply", threadId: item.thread_id, version: item.version }) });
      const data = await readJsonResponse<{ item: PartnerResponse; notice: string; error: string }>(response);
      if (!response.ok || !data.item) throw new Error(data.error || "Could not check reply status.");
      onSaved(data.item, data.notice);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not check reply status."); }
    finally { setBusy(false); }
  };

  const archive = async () => {
    if (busy || dirty || !item.in_inbox || !window.confirm("Archive this conversation in Gmail? It will leave your Gmail inbox, but Leo's follow-up status, notes, and drafts will stay unchanged. Nothing is deleted. You can move it back to Inbox in Gmail.")) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/partner-responses/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: item.thread_id, version: item.version, expectedMessageId: item.message_id, confirmed: true }) });
      const result = await readJsonResponse<{ ok?: boolean; item?: PartnerResponse; notice?: string; error?: string }>(response);
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not archive. Check reply status before trying again.");
      const notice = result.notice || "Archived in Gmail. Leo follow-up status and saved work are unchanged.";
      if (result.item) onSaved(result.item, notice);
      else onSent(notice); // Reuse the completion callback to reload the queue.
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not archive."); }
    finally { setBusy(false); }
  };

  const assess = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/partner-responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assess", threadId: item.thread_id, version: item.version }) });
      const data = await readJsonResponse<{ item: PartnerResponse; error: string }>(response);
      if (!response.ok || !data.item) throw new Error(data.error || "Could not assess response needs.");
      onSaved(data.item, "Response assessment saved. No email was sent and no conversation was automatically closed.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not assess response needs."); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4 border-t border-slate-100 p-5">
    <button disabled={busy} onClick={() => { if (!dirty || window.confirm("Leave without saving your changes?")) onBack(); }} className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={14} /> Back to queue</button>
    <div><p className="text-xs font-semibold text-emerald-800">{item.partner_name}</p><h3 className="mt-1 text-xl font-semibold">{item.subject}</h3><p className="mt-1 text-sm text-slate-500">{item.sender}</p></div>
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      <button type="button" disabled={busy || dirty || !item.in_inbox} onClick={() => void archive()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700 disabled:opacity-50"><Archive size={14} />{item.in_inbox ? "Archive in Gmail" : "Not in Gmail inbox"}</button>
      <span>{dirty ? "Save your edits before archiving." : "Removes it from Gmail’s inbox—not from Leo’s follow-up queue. Nothing is deleted."}</span>
    </div>
    <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{item.status === "handled" ? "No follow-up needed. This conversation stays handled unless a new incoming email arrives or you reopen it." : item.reason}</p>
    {item.status !== "handled" && <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
      <button type="button" disabled={busy} onClick={() => void save(false, true)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">No follow-up needed</button>
      <p className="mt-2 text-xs text-slate-500">Saves your edits, clears the follow-up date, and moves this to Handled recently. A new incoming email brings it back after the next mail check. Nothing is sent or archived in Gmail.</p>
    </div>}
    {item.preparation_reason && item.preparation_message_id === item.message_id && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Leo’s preparation decision: {item.preparation_reason}</p>}
    {isStaleDraft(item) && !["waiting", "handled"].includes(item.status) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This draft is from an earlier message. Review the latest thread and update the draft before sending.</p>}
    <a href={`/mail?thread=${encodeURIComponent(item.thread_id)}`} onClick={(event) => { if (dirty && !window.confirm("Your edits are not saved. Open Mail anyway?")) event.preventDefault(); }} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">Open thread in Mail · send, tasks, and TEMU <ExternalLink size={14} /></a>
    {isActionNeeded(item) && <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3 text-sm text-slate-700">
      <h4 className="font-semibold">Action needed · no email reply required</h4>
      <p className="mt-1">Check Work for an existing task first, or use Add task in Mail. This classification does not create a task, perform platform changes, or mark work complete.</p>
      <a href="/work" onClick={(event) => { if (dirty && !window.confirm("Your edits are not saved. Open Work anyway?")) event.preventDefault(); }} className="mt-2 inline-flex items-center gap-2 font-semibold text-emerald-800">Open Work <ExternalLink size={14} /></a>
      <p className="mt-2 text-xs">If you need to acknowledge the request or confirm completion by email, choose Reply needed and save. Mark No follow-up needed only once nothing remains outstanding.</p>
    </div>}
    <PartnerEmailContext threadId={item.thread_id} basedOnMessageId={item.draft ? item.draft_message_id : null} queueStatus={item.status} onRefreshStatus={recheckReply} refreshDisabled={busy || dirty} />
    {policyReady && <div className="space-y-3 rounded-lg border border-emerald-100 p-4">
      <h4 className="font-semibold text-slate-800">What does this conversation need?</h4>
      {assessment ? <p className="text-sm text-slate-600">Leo suggests <strong>{RESPONSE_CHOICES.find(([key]) => key === assessment.decision)?.[1]}</strong> ({assessment.confidence} confidence): {assessment.reason}</p> : <p className="text-sm text-slate-500">Not yet assessed for the latest email.</p>}
      {correction && <p className="text-sm text-emerald-800">Your saved decision: {RESPONSE_CHOICES.find(([key]) => key === correction.decision)?.[1]}. Your decision takes precedence for this message.</p>}
      <button type="button" disabled={busy || dirty} onClick={() => void assess()} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">Assess response needs</button>
      {dirty && <p className="text-xs text-slate-500">Save your edits before reassessing.</p>}
      <label className="block text-sm text-slate-700">Your decision<select disabled={busy} value={decision} onChange={(event) => setDecision(event.target.value as ResponseNeed | "")} className="ml-2 rounded-lg border border-slate-200 p-2"><option value="" disabled>Choose a decision</option>{RESPONSE_CHOICES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="block text-sm text-slate-700">Why? (optional)<textarea disabled={busy || !decision} value={feedback} maxLength={800} onChange={(event) => setFeedback(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 p-2" placeholder="Example: These names mean I need to add staff, not send another reply." /></label>
      <p className="text-xs text-slate-500">Use Save changes below to confirm. Corrections become examples for this partner, not automatic rules. To teach an email-type rule or partner exception, explicitly approve it below. Saved Action only decisions move to Action needed; uncertain assessments stay in Needs your input. No task is created automatically.</p>
    </div>}
    {policyReady && <ResponseRulesPanel item={item} disabled={busy || dirty} />}
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      <button type="button" disabled={busy || dirty} onClick={() => void recheckReply()} className="rounded-lg border border-emerald-200 px-3 py-2 font-semibold text-emerald-800 disabled:opacity-50">Check reply status</button>
      <span>{dirty ? "Save your edits before checking reply status." : "Already replied in Gmail? Check the latest message and update this queue item."}</span>
    </div>
    <label className="block text-sm font-medium text-slate-700">Notes / direction for Leo<textarea disabled={busy} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 p-3 font-normal" placeholder="What should Leo know before drafting?" /></label>
    <div className="flex flex-wrap gap-4">
      <label className="text-sm text-slate-600">Status<select disabled={busy} value={status} onChange={(event) => setStatus(event.target.value as ResponseStatus)} className="ml-2 rounded-lg border border-slate-200 p-2">{lanes.filter(([key]) => key !== "all" && key !== "critical" && key !== "action_needed").map(([key, label]) => <option key={key} value={key}>{key === "needs_input" && isActionNeeded(item) ? "Action needed" : label}</option>)}</select></label>
      <label className="text-sm text-slate-600">Follow-up date<input disabled={busy || status === "handled"} type="date" value={status === "handled" ? "" : followUp} onChange={(event) => setFollowUp(event.target.value)} className="ml-2 rounded-lg border border-slate-200 p-2 disabled:opacity-50" /></label>
    </div>
    <label className="block text-sm font-medium text-slate-700">Reply draft<textarea disabled={busy} value={draft} onChange={(event) => setDraft(event.target.value)} rows={10} className="mt-1 w-full rounded-lg border border-slate-200 p-3 font-normal leading-relaxed" placeholder="Prepare a draft with Leo, or write one here." /></label>
    {!draft && <p className="text-xs text-slate-500">No active draft. Sent drafts are kept in Previous drafts. Leo prepares another reply only when the latest message needs an answer.</p>}
    {item.draft_sources.length > 0 && <div className="text-xs text-slate-500"><p className="mb-2 font-semibold">Sources used</p>{item.draft_sources.map((source) => <p key={source.id}>{source.url && /^https?:\/\//.test(source.url) ? <a href={source.url} target="_blank" rel="noreferrer" className="underline">{source.title}</a> : source.title}</p>)}</div>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={busy || !draft.trim() || isStaleDraft(item) || ["waiting", "handled"].includes(status)} onClick={() => void save(false, false, true)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Review &amp; send</button>
      <button disabled={busy} onClick={() => void save()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working…" : "Save changes"}</button>
      <button disabled={busy} onClick={() => void save(true)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {item.draft ? "Prepare a fresh draft" : "Draft with Leo"}</button>
      <button onClick={() => void loadHistory()} className="text-xs text-slate-500 underline">Previous drafts</button>
      <span className="text-xs text-slate-400">Saved {new Date(item.updated_at).toLocaleString()}</span>
    </div>
    <p className="text-xs text-slate-500">Review &amp; send saves your edits first, then asks you to confirm the recipient and reply. For an older draft, review the latest email and save your updated draft first.</p>
    {sendItem && <PartnerReplySendDialog item={sendItem} onClose={(attempted) => { onSaved(sendItem); if (attempted) onBack(); }} onSent={onSent} />}
    {history && <div className="space-y-3">{history.length ? history.map((revision) => <details key={revision.id} className="rounded-lg border border-slate-200 p-3 text-sm"><summary>Draft saved {new Date(revision.saved_at).toLocaleString()}</summary><p className="mt-3 whitespace-pre-wrap">{revision.draft}</p></details>) : <p className="text-xs text-slate-500">No previous draft versions yet.</p>}</div>}
  </div>;
}
