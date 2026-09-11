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
import PartnerResponseRowArchive from "./PartnerResponseRowArchive";
import AttentionEmailTasks from "./AttentionEmailTasks";
import { RESPONSE_CHOICES, type ResponseNeed } from "@/lib/response-needed-policy";
import { isActionNeeded } from "@/lib/partner-response-lane";
import { CALENDAR_EMAIL_LABELS, calendarEmailKind, calendarEmailSection } from "@/lib/calendar-email";
import { keepResponseEdits, readCurrentResponse, reconcileResponse, responseEditorState, responseForm, responseFormDirty, saveResponseEdits, type ResponseEditorState, type ResponseForm } from "@/lib/partner-response-editor";

const lanes = [
  ["all", "All open"], ["critical", "Critical now"], ["needs_response", "Needs response"],
  ["draft_ready", "Draft ready"], ["action_needed", "Action needed"], ["needs_input", "Needs your input"], ["calendar", "Calendar"],
  ["waiting", "Waiting / follow-up"], ["handled", "Handled recently"],
] as const;
type Lane = typeof lanes[number][0];
interface QueueData {
  configured: boolean;
  setup?: string;
  items: PartnerResponse[];
  sync: MailSyncState;
  counts: Record<ResponseStatus, number>;
  laneCounts?: Partial<Record<Lane | "calendar_action" | "calendar_updates", number>>;
  hasMore: boolean;
  error?: string;
  policy?: { ready: boolean; enabled?: boolean; error?: string; last_error?: string | null };
}

export default function PartnerResponseQueue() {
  const [data, setData] = useState<QueueData | null>(null);
  const [lane, setLane] = useState<Lane>("all");
  const [calendarView, setCalendarView] = useState<"calendar_action" | "calendar_updates">("calendar_action");
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
      const response = await fetch(`/api/partner-responses?lane=${lane === "calendar" ? calendarView : lane}&page=${page}`, { cache: "no-store" });
      const body = await readJsonResponse<QueueData>(response);
      if (!response.ok) throw new Error(body.error || "Could not load partner responses.");
      if (id === requestId.current) { setData(body as QueueData); setError(null); }
    } catch (caught) {
      if (id === requestId.current) setError(caught instanceof Error ? caught.message : "Could not load partner responses.");
    } finally { if (id === requestId.current) setLoading(false); }
  }, [lane, calendarView, page]);

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
            {label}{key !== "all" && key !== "critical" ? ` · ${data.laneCounts?.[key] ?? (key === "action_needed" || key === "calendar" ? 0 : data.counts?.[key]) ?? 0}` : ""}
          </button>)}
        </div>}
        {selected ? <ResponseEditor key={`${selected.thread_id}:${selected.version}`} item={selected} policyReady={data.policy?.ready} onBack={() => setSelected(null)} onSent={(notice) => { setSelected(null); setReceipt(notice); void load(); window.dispatchEvent(new Event("leo:attention-updated")); }} onSaved={(item, notice) => { setSelected(item); setReceipt(notice ?? "Changes saved."); void load(); window.dispatchEvent(new Event("leo:attention-updated")); }} /> : <>
          {lane === "calendar" && <div className="space-y-3 px-5 pb-4">
            <p className="text-sm text-slate-600">Invitations and event notifications, separate from regular email. Urgent items remain in Critical now; All open includes both. Handled notifications stay in Handled recently.</p>
            <div className="flex gap-2" aria-label="Calendar filters">
              {([ ["calendar_action", "Needs action"], ["calendar_updates", "Updates only"] ] as const).map(([key, label]) => <button key={key} aria-pressed={calendarView === key} onClick={() => { setCalendarView(key); setPage(0); }} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${calendarView === key ? "border-sky-700 bg-sky-700 text-white" : "border-slate-200 text-slate-600"}`}>{label} · {data.laneCounts?.[key] ?? 0}</button>)}
            </div>
            <p className="text-xs text-slate-500">{calendarView === "calendar_action" ? "RSVPs, scheduling changes, questions, and notifications still awaiting assessment. This is not a live RSVP status check." : "Current high-confidence assessments indicate no response or action remains. Review and mark handled when appropriate; nothing is closed automatically."}</p>
          </div>}
          {loading && <p className="px-5 pb-3 text-xs text-slate-500">Loading saved responses…</p>}
          {lane === "action_needed" && <p className="px-5 pb-4 text-sm text-slate-600">Work to do, not an email to write. Your saved Action only decisions and Leo’s high-confidence assessments appear here. Open a conversation for the task links.</p>}
          {lane === "needs_input" && <p className="px-5 pb-4 text-sm text-slate-600">Decisions, missing information, and uncertain classifications. Confirmed action-only work appears in Action needed.</p>}
          <div className="divide-y divide-slate-100">
            {data.items?.map((item) => {
              const calendarKind = calendarEmailKind(item);
              return <div key={item.thread_id} className="sm:flex sm:items-start">
                <button type="button" onClick={() => setSelected(item)} className="block w-full min-w-0 flex-1 px-5 py-4 text-left hover:bg-emerald-50/40">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-emerald-800">{item.partner_name}</span>
                {item.urgency === "now" && item.status !== "handled" && <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">Critical</span>}
                <span className="text-slate-500">{calendarKind && item.status !== "handled" ? `Calendar · ${calendarEmailSection(item) === "calendar_updates" ? "Updates only" : "Needs action"}` : isActionNeeded(item) ? "Action needed" : lanes.find(([key]) => key === item.status)?.[1]}</span>
                {calendarKind && <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-800">{CALENDAR_EMAIL_LABELS[calendarKind]}</span>}
                {isStaleDraft(item) && !["waiting", "handled"].includes(item.status) && <span className="font-semibold text-amber-700">Draft needs updating</span>}
                {item.follow_up_on && <span className="text-amber-800">Follow up {item.follow_up_on}</span>}
              </div>
              <h3 className="mt-2 font-semibold text-slate-900">{item.subject || "No subject"}</h3>
              {item.response_correction?.message_id === item.message_id
                ? <p className="mt-1 text-xs text-emerald-800">Your decision: {RESPONSE_CHOICES.find(([key]) => key === item.response_correction?.decision)?.[1]}{item.response_correction.reason ? ` · ${item.response_correction.reason}` : ""}</p>
                : item.response_assessment?.message_id === item.message_id && <p className="mt-1 text-xs text-emerald-800">Leo suggests: {RESPONSE_CHOICES.find(([key]) => key === item.response_assessment?.decision)?.[1]} · {item.response_assessment.reason}</p>}
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.snippet}</p>
                </button>
                <PartnerResponseRowArchive item={item} onRefresh={load} onArchived={(notice) => {
                  setReceipt(notice); void load(); window.dispatchEvent(new Event("leo:attention-updated"));
                }} />
              </div>; })}
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

function ResponseEditor({ item: initialItem, policyReady = false, onBack, onSaved: notifySaved, onSent }: { item: PartnerResponse; policyReady?: boolean; onBack: () => void; onSaved: (item: PartnerResponse, notice?: string) => void; onSent: (notice: string) => void }) {
  const [editor, setEditor] = useState(() => responseEditorState(initialItem));
  const editorRef = useRef(editor);
  const actionLock = useRef(false);
  const reviewingSend = useRef(false);
  const refreshSequence = useRef(0);
  const invalidateRefresh = useCallback(() => { refreshSequence.current++; }, []);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const replaceEditor = useCallback((next: ResponseEditorState) => { editorRef.current = next; setEditor(next); }, []);
  const item = editor.base;
  const { draft, notes, followUp, status, decision, feedback } = editor.form;
  const setField = <K extends keyof ResponseForm>(key: K, value: ResponseForm[K]) => {
    replaceEditor({ ...editorRef.current, form: { ...editorRef.current.form, [key]: value } });
  };
  const setDraft = (value: string) => setField("draft", value);
  const setNotes = (value: string) => setField("notes", value);
  const setFollowUp = (value: string) => setField("followUp", value);
  const setStatus = (value: ResponseStatus) => setField("status", value);
  const setDecision = (value: ResponseNeed | "") => setField("decision", value);
  const setFeedback = (value: string) => setField("feedback", value);
  const onSaved = (latest: PartnerResponse, notice?: string) => { replaceEditor(responseEditorState(latest)); notifySaved(latest, notice); };
  const calendarKind = calendarEmailKind(item);
  const correction = item.response_correction?.message_id === item.message_id ? item.response_correction : null;
  const assessment = item.response_assessment?.message_id === item.message_id ? item.response_assessment : null;
  const [working, setBusy] = useState(false);
  const [taskEditing, setTaskEditing] = useState(false);
  const busy = working || Boolean(editor.pending) || taskEditing;
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: number; draft: string; saved_at: string }[] | null>(null);
  const [sendItem, setSendItem] = useState<PartnerResponse | null>(null);
  const dirty = responseFormDirty(editor);
  const refreshEditor = useCallback(async () => {
    if (actionLock.current || reviewingSend.current) return;
    const sequence = ++refreshSequence.current;
    try {
      const latest = await readCurrentResponse(initialItem.thread_id);
      if (sequence === refreshSequence.current && !actionLock.current && !reviewingSend.current) { replaceEditor(reconcileResponse(editorRef.current, latest)); setRefreshError(null); }
    } catch (caught) { if (sequence === refreshSequence.current) setRefreshError(caught instanceof Error ? caught.message : "Could not refresh. Your edits are retained."); }
  }, [initialItem.thread_id, replaceEditor]);
  useEffect(() => {
    let alive = true;
    const refresh = async () => { if (alive && document.visibilityState === "visible") await refreshEditor(); };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    const updated = () => { void refresh(); };
    window.addEventListener("leo:attention-updated", updated);
    return () => { alive = false; invalidateRefresh(); window.clearInterval(interval); window.removeEventListener("leo:attention-updated", updated); };
  }, [refreshEditor, invalidateRefresh]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (makeDraft = false, noFollowUp = false, reviewSend = false) => {
    if (actionLock.current || editorRef.current.pending) return;
    actionLock.current = true;
    setBusy(true); setError(null);
    try {
      const savedItem = await saveResponseEdits(editorRef.current, policyReady, noFollowUp, replaceEditor);
      if (!savedItem) return;
      // A confirmed save is the new baseline even if subsequent generation fails.
      replaceEditor(responseEditorState(savedItem));
      if (reviewSend) { reviewingSend.current = true; setSendItem(savedItem); return; }
      if (noFollowUp) {
        onSaved(savedItem, "No follow-up needed. Saved in Handled recently; a new incoming email will reopen it after the next mail check. Notes and drafts are retained.");
        onBack();
        return;
      }
      if (!makeDraft) { onSaved(savedItem); return; }
      const generated = await fetch("/api/partner-responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", threadId: item.thread_id, version: savedItem.version, notes: savedItem.notes }) });
      const result = await readJsonResponse<{ error: string; item: PartnerResponse }>(generated);
      if (!generated.ok || !result.item) {
        // Keep the new version usable after an unsuccessful generation.
        onSaved(savedItem, `Notes saved, but Leo could not prepare a draft. ${result.error || "Try again."}`);
        return;
      }
      onSaved(result.item);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save response."); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const loadHistory = async () => {
    try {
      const response = await fetch(`/api/partner-responses?threadId=${encodeURIComponent(item.thread_id)}`);
      const data = await readJsonResponse<{ revisions: { id: number; draft: string; saved_at: string }[]; error: string }>(response);
      if (!response.ok) throw new Error(data.error || "Could not load history.");
      setHistory(data.revisions ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load history."); }
  };

  const currentActionItem = async () => {
    const next = reconcileResponse(editorRef.current, await readCurrentResponse(item.thread_id), true);
    replaceEditor(next);
    return next.pending ? null : next.base;
  };

  const recheckReply = async () => {
    if (actionLock.current || busy || dirty) return;
    actionLock.current = true;
    setBusy(true); setError(null);
    try {
      const current = await currentActionItem();
      if (!current) return;
      const response = await fetch("/api/partner-responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recheck_reply", threadId: current.thread_id, version: current.version }) });
      const data = await readJsonResponse<{ item: PartnerResponse; notice: string; error: string }>(response);
      if (!response.ok || !data.item) throw new Error(data.error || "Could not check reply status.");
      onSaved(data.item, data.notice);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not check reply status."); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const archive = async () => {
    if (actionLock.current || busy || dirty || !item.in_inbox || !window.confirm("Archive this conversation in Gmail? It will leave your Gmail inbox, but Leo's follow-up status, notes, and drafts will stay unchanged. Nothing is deleted. You can move it back to Inbox in Gmail.")) return;
    actionLock.current = true;
    setBusy(true); setError(null);
    try {
      const current = await currentActionItem();
      if (!current) return;
      const response = await fetch("/api/partner-responses/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: current.thread_id, version: current.version, expectedMessageId: current.message_id, confirmed: true }) });
      const result = await readJsonResponse<{ ok?: boolean; item?: PartnerResponse; notice?: string; error?: string }>(response);
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not archive. Check reply status before trying again.");
      const notice = result.notice || "Archived in Gmail. Leo follow-up status and saved work are unchanged.";
      if (result.item) onSaved(result.item, notice);
      else onSent(notice); // Reuse the completion callback to reload the queue.
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not archive."); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const assess = async () => {
    if (actionLock.current || busy || dirty) return;
    actionLock.current = true;
    setBusy(true); setError(null);
    try {
      const current = await currentActionItem();
      if (!current) return;
      const response = await fetch("/api/partner-responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assess", threadId: current.thread_id, version: current.version }) });
      const data = await readJsonResponse<{ item: PartnerResponse; error: string }>(response);
      if (!response.ok || !data.item) throw new Error(data.error || "Could not assess response needs.");
      onSaved(data.item, "Response assessment saved. No email was sent and no conversation was automatically closed.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not assess response needs."); }
    finally { actionLock.current = false; setBusy(false); }
  };

  return <div className="space-y-4 border-t border-slate-100 p-5">
    <button disabled={working || taskEditing} onClick={() => { if (!dirty || window.confirm("Leave without saving your changes?")) onBack(); }} className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={14} /> Back to queue</button>
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      <span>Background updates preserve your unsaved edits.</span>
      <button type="button" disabled={working || Boolean(sendItem)} onClick={() => void refreshEditor()} className="font-semibold text-emerald-800 underline">Refresh conversation</button>
    </div>
    {refreshError && <p role="alert" className="text-sm text-amber-800">{refreshError}</p>}
    {editor.pending && <div role="alert" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Review changed information: {editor.conflicts.join(", ")}. Your unsaved edits are still here.</p>
      <p>Review the latest email below before continuing. Nothing is sent or saved by choosing a version.</p>
      <details><summary className="cursor-pointer underline">Compare your edits with the saved version</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div><p className="font-semibold">Your editor</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(editor.form, null, 2)}</pre></div>
          <div><p className="font-semibold">Latest saved version</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(responseForm(editor.pending), null, 2)}</pre></div>
        </div>
      </details>
      <button type="button" disabled={working} onClick={() => { replaceEditor(keepResponseEdits(editorRef.current)); setError(null); }} className="mr-3 rounded border border-amber-300 bg-white px-3 py-2 font-semibold">Reviewed latest; keep my edits</button>
      <button type="button" disabled={working} onClick={() => { if (editorRef.current.pending && (!dirty || window.confirm("Discard your unsaved edits and use the latest saved version?"))) { replaceEditor(responseEditorState(editorRef.current.pending)); setError(null); } }} className="underline">Use saved version</button>
    </div>}
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
    <a href={`/mail?thread=${encodeURIComponent(item.thread_id)}`} onClick={(event) => { if ((dirty || taskEditing) && !window.confirm("Your email or task edits are not saved. Open Mail anyway?")) event.preventDefault(); }} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">Open thread in Mail · send, tasks, and TEMU <ExternalLink size={14} /></a>
    {calendarKind && <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3 text-sm text-slate-700">
      <h4 className="font-semibold">Calendar · {CALENDAR_EMAIL_LABELS[calendarKind]}</h4>
      <p className="mt-1">Review the notification below, including any added questions. Open the event in Google Calendar to check its current details and your RSVP. Leo has not verified your RSVP, accepted, declined, or changed the event.</p>
      <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 font-semibold text-sky-800">Open Google Calendar <ExternalLink size={14} /></a>
    </div>}
    {!calendarKind && isActionNeeded(item) && <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3 text-sm text-slate-700">
      <h4 className="font-semibold">Action needed · no email reply required</h4>
      <p className="mt-1">Review Linked work below, or create a task here. This classification does not create a task, perform platform changes, or mark work complete.</p>
      <a href="/work" onClick={(event) => { if (dirty && !window.confirm("Your edits are not saved. Open Work anyway?")) event.preventDefault(); }} className="mt-2 inline-flex items-center gap-2 font-semibold text-emerald-800">Open Work <ExternalLink size={14} /></a>
      <p className="mt-2 text-xs">If you need to acknowledge the request or confirm completion by email, choose Reply needed and save. Mark No follow-up needed only once nothing remains outstanding.</p>
    </div>}
    <PartnerEmailContext key={`${item.thread_id}:${editor.pending?.message_id ?? item.message_id}`} threadId={item.thread_id} basedOnMessageId={item.draft ? item.draft_message_id : null} queueStatus={item.status} onRefreshStatus={recheckReply} refreshDisabled={busy || dirty} />
    <AttentionEmailTasks key={item.thread_id} threadId={item.thread_id} disabled={working || Boolean(editor.pending) || Boolean(sendItem)} onEditingChange={setTaskEditing} />
    {taskEditing && <p className="text-xs text-slate-500">Create or cancel the task before saving or closing this email.</p>}
    {policyReady && <div className="space-y-3 rounded-lg border border-emerald-100 p-4">
      <h4 className="font-semibold text-slate-800">What does this conversation need?</h4>
      {assessment ? <p className="text-sm text-slate-600">Leo suggests <strong>{RESPONSE_CHOICES.find(([key]) => key === assessment.decision)?.[1]}</strong> ({assessment.confidence} confidence): {assessment.reason}</p> : <p className="text-sm text-slate-500">Not yet assessed for the latest email.</p>}
      {correction && <p className="text-sm text-emerald-800">Your saved decision: {RESPONSE_CHOICES.find(([key]) => key === correction.decision)?.[1]}. Your decision takes precedence for this message.</p>}
      <button type="button" disabled={busy || dirty} onClick={() => void assess()} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">Assess response needs</button>
      {dirty && <p className="text-xs text-slate-500">Save your edits before reassessing.</p>}
      <label className="block text-sm text-slate-700">Your decision<select disabled={busy} value={decision} onChange={(event) => setDecision(event.target.value as ResponseNeed | "")} className="ml-2 rounded-lg border border-slate-200 p-2"><option value="" disabled>Choose a decision</option>{RESPONSE_CHOICES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="block text-sm text-slate-700">Why? (optional)<textarea disabled={busy || !decision} value={feedback} maxLength={800} onChange={(event) => setFeedback(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 p-2" placeholder="Example: These names mean I need to add staff, not send another reply." /></label>
      <p className="text-xs text-slate-500">Use Save changes below to confirm. Corrections become examples for this partner, not automatic rules. To teach an email-type rule or partner exception, explicitly approve it below. {calendarKind ? "Calendar notifications remain in Calendar until handled. Uncertain assessments stay in its Needs action section." : "Saved Action only decisions move to Action needed; uncertain assessments stay in Needs your input."} No task is created automatically.</p>
    </div>}
    {policyReady && <ResponseRulesPanel item={item} disabled={busy || dirty} />}
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      <button type="button" disabled={busy || dirty} onClick={() => void recheckReply()} className="rounded-lg border border-emerald-200 px-3 py-2 font-semibold text-emerald-800 disabled:opacity-50">Check reply status</button>
      <span>{dirty ? "Save your edits before checking reply status." : "Already replied in Gmail? Check the latest message and update this queue item."}</span>
    </div>
    <label className="block text-sm font-medium text-slate-700">Notes / direction for Leo<textarea disabled={busy} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 p-3 font-normal" placeholder="What should Leo know before drafting?" /></label>
    <div className="flex flex-wrap gap-4">
      <label className="text-sm text-slate-600">Status<select disabled={busy} value={status} onChange={(event) => setStatus(event.target.value as ResponseStatus)} className="ml-2 rounded-lg border border-slate-200 p-2">{lanes.filter(([key]) => key !== "all" && key !== "critical" && key !== "action_needed" && key !== "calendar").map(([key, label]) => <option key={key} value={key}>{key === "needs_input" && !calendarKind && isActionNeeded(item) ? "Action needed" : label}</option>)}</select></label>
      <label className="text-sm text-slate-600">Follow-up date<input disabled={busy || status === "handled"} type="date" value={status === "handled" ? "" : followUp} onChange={(event) => setFollowUp(event.target.value)} className="ml-2 rounded-lg border border-slate-200 p-2 disabled:opacity-50" /></label>
    </div>
    <label className="block text-sm font-medium text-slate-700">Reply draft<textarea disabled={busy} value={draft} onChange={(event) => setDraft(event.target.value)} rows={10} className="mt-1 w-full rounded-lg border border-slate-200 p-3 font-normal leading-relaxed" placeholder="Prepare a draft with Leo, or write one here." /></label>
    {!draft && <p className="text-xs text-slate-500">No active draft. Sent drafts are kept in Previous drafts. Leo prepares another reply only when the latest message needs an answer.</p>}
    {item.draft_sources.length > 0 && <div className="text-xs text-slate-500"><p className="mb-2 font-semibold">Sources used</p>{item.draft_sources.map((source) => <p key={source.id}>{source.url && /^https?:\/\//.test(source.url) ? <a href={source.url} target="_blank" rel="noreferrer" className="underline">{source.title}</a> : source.title}</p>)}</div>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={busy || !draft.trim() || isStaleDraft(item) || ["waiting", "handled"].includes(status)} onClick={() => void save(false, false, true)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Review &amp; send</button>
      <button disabled={busy} onClick={() => void save()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{working ? "Working…" : "Save changes"}</button>
      <button disabled={busy} onClick={() => void save(true)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {item.draft ? "Prepare a fresh draft" : "Draft with Leo"}</button>
      <button onClick={() => void loadHistory()} className="text-xs text-slate-500 underline">Previous drafts</button>
      <span className="text-xs text-slate-400">Saved {new Date(item.updated_at).toLocaleString()}</span>
    </div>
    <p className="text-xs text-slate-500">Review &amp; send saves your edits first, then asks you to confirm the recipient and reply. For an older draft, review the latest email and save your updated draft first.</p>
    {sendItem && <PartnerReplySendDialog item={sendItem} onClose={(attempted) => { reviewingSend.current = false; setSendItem(null); onSaved(sendItem); if (attempted) onBack(); }} onSent={onSent} />}
    {history && <div className="space-y-3">{history.length ? history.map((revision) => <details key={revision.id} className="rounded-lg border border-slate-200 p-3 text-sm"><summary>Draft saved {new Date(revision.saved_at).toLocaleString()}</summary><p className="mt-3 whitespace-pre-wrap">{revision.draft}</p></details>) : <p className="text-xs text-slate-500">No previous draft versions yet.</p>}</div>}
  </div>;
}
