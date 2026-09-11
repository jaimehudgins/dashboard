"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonResponse } from "@/lib/http";
import { normalizedTaskTitle, type EmailTaskPreview, type EmailTaskSummary } from "@/lib/email-task";

interface TaskData { tasks?: EmailTaskSummary[]; preview?: EmailTaskPreview; task?: EmailTaskSummary; existing?: boolean; error?: string }

export default function AttentionEmailTasks({ threadId, disabled = false, onEditingChange }: { threadId: string; disabled?: boolean; onEditingChange: (editing: boolean) => void }) {
  const [tasks, setTasks] = useState<EmailTaskSummary[]>([]);
  const [preview, setPreview] = useState<EmailTaskPreview | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => { onEditingChange(Boolean(preview) || busy); }, [preview, busy, onEditingChange]);
  const loadTasks = useCallback(async () => {
    const response = await fetch(`/api/partner-responses/tasks?threadId=${encodeURIComponent(threadId)}`, { cache: "no-store" });
    const data = await readJsonResponse<TaskData>(response);
    if (!response.ok || !data.tasks) throw new Error(data.error || "Could not check existing tasks.");
    return data.tasks;
  }, [threadId]);
  useEffect(() => {
    let active = true;
    void loadTasks().then((items) => { if (active) { setTasks(items); setReady(true); } }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load tasks."); });
    return () => { active = false; };
  }, [loadTasks]);
  useEffect(() => {
    if (!preview) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [preview]);
  const open = async () => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/partner-responses/tasks?threadId=${encodeURIComponent(threadId)}&preview=1`, { cache: "no-store" });
      const data = await readJsonResponse<TaskData>(response);
      if (!response.ok || !data.preview || !data.tasks) throw new Error(data.error || "Could not read the email for this task.");
      setTasks(data.tasks); setReady(true); setPreview(data.preview);
      setTitle(data.preview.title); setNotes(data.preview.notes); setDueDate(""); setLinks([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not prepare task details."); }
    finally { lock.current = false; setBusy(false); }
  };
  const create = async () => {
    if (!preview || lock.current || disabled || !title.trim()) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch("/api/partner-responses/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        threadId, messageId: preview.messageId, confirmed: true, title, notes, dueDate: dueDate || null, links,
      }) });
      const data = await readJsonResponse<TaskData>(response);
      if (!response.ok || !data.task) throw new Error(data.error || "Could not confirm creation. Refresh linked tasks before retrying.");
      const task = data.task;
      setTasks((current) => [...current.filter((item) => item.id !== task.id), task]);
      setNotice(data.existing ? "That task already exists. No duplicate was created and its details were not changed." : "Task saved in Work. The email's response status is unchanged.");
      setPreview(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not confirm creation. Your task text is retained."); }
    finally { lock.current = false; setBusy(false); }
  };
  const duplicate = tasks.find((task) => normalizedTaskTitle(task.title) === normalizedTaskTitle(title));
  return <section className="space-y-3 rounded-lg border border-slate-200 p-4" aria-label="Tasks from this email">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold text-slate-700">Linked work</h4>
      {!preview && <button type="button" disabled={busy || disabled} onClick={() => void open()} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">{busy ? "Reading email…" : "Create task"}</button>}
    </div>
    <p className="text-xs text-slate-500">Tasks stay linked here, including after completion. Creating or completing one does not close this conversation, send a reply, or add anything to TEMU.</p>
    {tasks.length > 0 ? <ul className="space-y-2">{tasks.map((task) => <li key={task.id} className="text-sm">
      <a href={`/work?task=${encodeURIComponent(task.id)}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-800 underline">{task.title} · Open in Work</a>
      <span className="ml-2 text-xs text-slate-500">{task.status.replaceAll("_", " ")}{task.due_date ? ` · Due ${task.due_date.slice(0, 10)}` : ""}</span>
    </li>)}</ul> : ready && <p className="text-sm text-slate-500">No linked tasks found. Other unlinked work may exist.</p>}
    <button type="button" disabled={busy} onClick={async () => { setError(null); try { setTasks(await loadTasks()); setReady(true); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not refresh tasks."); } }} className="text-xs text-emerald-800 underline">Refresh linked tasks</button>
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {preview && <div className="space-y-3 border-t border-slate-100 pt-3">
      <p className="text-xs text-slate-500">Review the suggested action and email excerpt. Edit the notes to include the relevant earlier messages if needed. Nothing is created until you confirm.</p>
      <label className="block text-sm">Task title<input value={title} maxLength={240} disabled={busy} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded border border-slate-300 p-2" /></label>
      <label className="block text-sm">Task details / notes<textarea value={notes} maxLength={12000} rows={7} disabled={busy} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded border border-slate-300 p-2" /></label>
      <label className="block text-sm">Due date (optional)<input type="date" value={dueDate} disabled={busy} onChange={(event) => setDueDate(event.target.value)} className="ml-2 rounded border border-slate-300 p-2" /></label>
      {preview.links.length > 0 && <fieldset className="space-y-2"><legend className="text-sm font-semibold">Include relevant links from this thread</legend>{preview.links.map((url) => <label key={url} className="flex items-start gap-2 break-all text-xs"><input type="checkbox" disabled={busy} checked={links.includes(url)} onChange={(event) => setLinks((current) => event.target.checked ? [...current, url] : current.filter((link) => link !== url))} /><a href={url} target="_blank" rel="noopener noreferrer" className="text-emerald-800 underline">{url}</a></label>)}</fieldset>}
      {duplicate && <p role="status" className="text-sm text-amber-800">A linked task has this title already ({duplicate.status}). Open it above, or use a distinct title for a different action.</p>}
      <div className="flex gap-3"><button type="button" disabled={busy || disabled || !title.trim() || Boolean(duplicate)} onClick={() => void create()} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving task…" : "Confirm and create task"}</button>
        <button type="button" disabled={busy} onClick={() => { if (window.confirm("Discard this unsaved task? Your email edits will stay unchanged.")) setPreview(null); }} className="text-sm underline">Cancel task</button></div>
    </div>}
  </section>;
}
