"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { ExternalLink, MessageSquareText, RefreshCw } from "lucide-react";
import { chooseCommentFile } from "@/lib/google-comment-picker";
import type { CommentCard, CommentFileView, DriveCommentSetup, DriveCommentStatus } from "@/types/drive-comments";

const button = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50";
const primary = "rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
const labels: Record<DriveCommentStatus, string> = { review: "Review", needs_response: "Needs response", no_action: "No action needed" };
async function api<T>(path = "", input?: object): Promise<T> {
  const result = await fetch(`/api/drive-comments${path}`, { cache: "no-store",
    ...(input ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : {}),
  });
  const body = await result.json().catch(() => ({ error: "Leo returned an incomplete response. Refresh before retrying a write." }));
  if (!result.ok || body.error) throw new Error(body.error || "Drive comments are unavailable.");
  return body as T;
}
function fileLink(id: string) { return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`; }
function quoteText(comment: CommentCard) {
  const value = comment.quotedFileContent?.value ?? "";
  return comment.quotedFileContent?.mimeType === "text/html" ? value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : value;
}

function CommentItem({ comment, view, refresh, editing }: { comment: CommentCard; view: CommentFileView; refresh: () => Promise<void>; editing: (id: string, open: boolean) => void }) {
  const [form, setForm] = useState<{ action: "reply" | "resolve" | "task"; revision: string } | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const writing = useRef(false);
  const openForm = (action: "reply" | "resolve" | "task") => {
    setForm({ action, revision: comment.revision }); setReviewed(false); setError(""); editing(comment.id, true);
  };
  const closeForm = () => { setForm(null); setReviewed(false); editing(comment.id, false); };
  const triage = async (status: DriveCommentStatus) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true); setError("");
    try {
      await api("", { action: "triage", fileId: view.file.id, commentId: comment.id, revision: comment.revision, status });
      setNotice(`${labels[status]} saved in Leo. Nothing changed in Drive.`);
      await refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save decision."); }
    finally { writing.current = false; setBusy(false); }
  };
  const submit = async () => {
    if (!form || writing.current) return;
    writing.current = true;
    setBusy(true); setError("");
    try {
      const result = await api<{ existing?: boolean }>("", { ...form, confirmed: true, fileId: view.file.id, commentId: comment.id,
        ...(form.action === "reply" ? { content } : form.action === "task" ? { title, notes } : {}),
      });
      setNotice(form.action === "reply" ? "Reply sent to Drive." : form.action === "resolve" ? "Comment resolved in Drive. Any Work task stays unchanged." : result.existing ? "This comment already has a task in Work." : "Task created in Work. The comment stays open in Drive.");
      if (form.action === "reply") setContent("");
      closeForm();
      await refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not confirm the action. Your text is retained."); }
    finally { writing.current = false; setBusy(false); }
  };
  return <article className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="font-semibold text-slate-800">{comment.author?.displayName || "Drive commenter"}</span>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{comment.resolved ? "Resolved in Drive" : labels[comment.status]}</span>
    </div>
    {quoteText(comment) && <blockquote className="mt-3 border-l-2 border-emerald-300 pl-3 text-sm text-slate-500">Quoted file text: {quoteText(comment)}</blockquote>}
    <p className="mt-3 whitespace-pre-wrap break-words text-base text-slate-800">{comment.content}</p>
    {comment.deleted && <p role="alert" className="mt-2 text-sm text-amber-800">This comment is no longer available. Your unsent text is retained below; copy it before closing.</p>}
    {!!comment.replies?.filter((reply) => !reply.deleted).length && <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-600">Replies ({comment.replies.filter((reply) => !reply.deleted).length})</summary>
      <div className="mt-2 space-y-3 border-l border-slate-200 pl-3">{comment.replies.filter((reply) => !reply.deleted).map((reply) => <div key={reply.id}>
        <p className="font-medium text-slate-600">{reply.author?.displayName || "Drive commenter"}</p>
        <p className="whitespace-pre-wrap break-words">{reply.content || (reply.action === "resolve" ? "Resolved this comment" : reply.action || "")}</p>
      </div>)}</div>
    </details>}
    {comment.task && <a href={`/work?task=${comment.task.id}`} target="_blank" rel="noreferrer" className="mt-3 block text-sm font-semibold text-emerald-700 underline">Work: {comment.task.title} · {comment.task.status}</a>}
    {comment.pendingWrite && <p className="mt-3 text-sm text-amber-800">A Drive action was already attempted for this version. Refresh and check the file before retrying. Automatic retries are blocked.</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {!comment.resolved && <>
        <button className={button} disabled={busy || !!form} onClick={() => triage("needs_response")}>Needs response</button>
        <button className={button} disabled={busy || !!form} onClick={() => triage("no_action")}>No action needed</button>
        <button className={button} disabled={busy || !!form || !view.canWrite || comment.pendingWrite || comment.deleted} onClick={() => openForm("reply")}>Reply in Drive</button>
        <button className={button} disabled={busy || !!form || !view.canWrite || comment.pendingWrite || comment.deleted} onClick={() => openForm("resolve")}>Resolve in Drive</button>
      </>}
      {!comment.task && <button className={button} disabled={busy || !!form} onClick={() => openForm("task")}>Create task</button>}
      {comment.status === "no_action" && !comment.resolved && <button className={button} disabled={busy || !!form} onClick={() => triage("review")}>Return to review</button>}
    </div>
    {form && <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <p className="font-semibold text-slate-800">{form.action === "reply" ? "Reply to this Drive comment" : form.action === "resolve" ? "Resolve this comment in Drive?" : "Create a task in Work"}</p>
      {form.action === "reply" && <label className="block text-sm">Your reply<textarea aria-label="Drive comment reply" value={content} disabled={busy || reviewed} onChange={(event) => setContent(event.target.value)} rows={5} maxLength={10000} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-base" /></label>}
      {form.action === "task" && <>
        <label className="block text-sm">Task title<input value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} maxLength={240} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-base" /></label>
        <label className="block text-sm">Notes<textarea value={notes} disabled={busy} onChange={(event) => setNotes(event.target.value)} maxLength={12000} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-base" /></label>
        <p className="text-sm text-slate-600">The file link, quoted text, and conversation are included. One linked task per comment; nothing is sent or resolved.</p>
      </>}
      {form.action === "resolve" && <p className="text-sm text-slate-600">This changes the shared comment in {view.file.name}. It does not complete a task or send a reply.</p>}
      {form.action === "reply" && reviewed && <p className="text-sm text-slate-600">This reply will be posted to the shared comment in {view.file.name}, visible to people with access to the file. It will not be sent as an email reply.</p>}
      {form.revision !== comment.revision && <div className="space-y-2 text-sm text-amber-800"><p>The comment changed. Read the refreshed conversation above before continuing.</p><button className={button} disabled={busy} onClick={() => { setForm({ ...form, revision: comment.revision }); setReviewed(false); }}>I reviewed the refreshed comment</button></div>}
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy} onClick={closeForm}>Cancel</button>
        {reviewed && <button className={button} disabled={busy} onClick={() => setReviewed(false)}>Edit reply</button>}
        {form.action === "reply" && !reviewed
          ? <button className={primary} disabled={!content.trim() || busy || form.revision !== comment.revision} onClick={() => setReviewed(true)}>Review reply</button>
          : <button className={primary} disabled={busy || comment.deleted || form.revision !== comment.revision || (form.action === "task" && !title.trim()) || (form.action !== "task" && (comment.resolved || comment.pendingWrite || !view.canWrite))} onClick={submit}>{busy ? "Saving…" : form.action === "reply" ? "Confirm and post reply" : form.action === "resolve" ? "Confirm resolve in Drive" : "Confirm and create task"}</button>}
      </div>
    </div>}
    {notice && <p role="status" className="mt-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </article>;
}

export default function DriveCommentQueue() {
  const [setup, setSetup] = useState<DriveCommentSetup | null>(null);
  const [view, setView] = useState<CommentFileView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [filter, setFilter] = useState("active");
  const [editors, setEditors] = useState<string[]>([]);
  const keepEdits = (updated: CommentFileView) => setView((previous) => {
    if (previous?.file.id !== updated.file.id) return updated;
    return { ...updated, comments: [...updated.comments, ...previous.comments.filter((comment) => editors.includes(comment.id) && !updated.comments.some((fresh) => fresh.id === comment.id)).map((comment) => ({ ...comment, deleted: true }))] };
  });
  const loadSetup = useCallback(async () => setSetup(await api<DriveCommentSetup>()), []);
  useEffect(() => { loadSetup().catch((error) => setError(error.message)); }, [loadSetup]);
  const loadFile = async (fileId: string) => {
    setBusy(true); setError("");
    try { keepEdits(await api<CommentFileView>(`?fileId=${encodeURIComponent(fileId)}`)); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load comments."); }
    finally { setBusy(false); }
  };
  const refresh = async () => {
    if (!view) return;
    // Throw on failure so a completed action is not mistaken for a successful refresh.
    const updated = await api<CommentFileView>(`?fileId=${encodeURIComponent(view.file.id)}`);
    keepEdits(updated);
  };
  const connect = async (picker: boolean) => {
    setBusy(true); setError("");
    try {
      let fileId: string | null;
      if (picker) fileId = await chooseCommentFile(await api("?picker=1"));
      else {
        const parsed = new URL(url);
        if (!["docs.google.com", "drive.google.com"].includes(parsed.hostname) || parsed.protocol !== "https:") throw new Error("Paste a Google Drive, Docs, Sheets, or Slides file link.");
        fileId = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? parsed.searchParams.get("id");
        if (!fileId) throw new Error("That link does not identify a file.");
      }
      if (!fileId) return;
      await api("", { action: "connect", fileId, confirmed: true });
      await loadSetup();
      setView(await api<CommentFileView>(`?fileId=${encodeURIComponent(fileId)}`));
      setUrl(""); setFilter("active");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not connect this file."); }
    finally { setBusy(false); }
  };
  const visible = view?.comments.filter((comment) => editors.includes(comment.id) || filter === "all" || (filter === "active" ? !comment.resolved && comment.status !== "no_action" : !comment.resolved && comment.status === filter)) ?? [];
  return <section id="drive-comments" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><MessageSquareText size={20} /> Drive comments</h2>
      <button className={button} disabled={busy} onClick={() => view ? loadFile(view.file.id) : loadSetup().catch((error) => setError(error.message))}><RefreshCw size={14} className={`mr-2 inline ${busy ? "animate-spin" : ""}`} />{busy ? "Loading…" : "Refresh comments"}</button>
    </div>
    <p className="text-sm text-slate-500">Read and handle comments here. “No action needed” only clears Leo’s queue; resolving changes the comment in Drive.</p>
    {error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    {!setup && !error && <p role="status" className="text-sm text-slate-500">Loading connected files…</p>}
    {setup && <>
      <div className="flex flex-wrap gap-2">
        <label className="min-w-48 flex-1 text-sm">Connected file<select aria-label="Connected Drive file" value={view?.file.id ?? ""} disabled={busy || editors.length > 0} onChange={(event) => event.target.value && loadFile(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2">
          <option value="">Choose a file</option>{setup.files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
        </select></label>
        <button className={`${button} self-end`} disabled={busy || editors.length > 0 || !setup.pickerReady || !setup.permissionReady} onClick={() => connect(true)}>Choose with Google Picker</button>
      </div>
      <details className="text-sm text-slate-600"><summary className="cursor-pointer">Connect a file link for reading</summary>
        <div className="mt-2 flex flex-wrap gap-2"><input aria-label="Google file URL" type="url" value={url} disabled={busy || editors.length > 0} onChange={(event) => setUrl(event.target.value)} placeholder="Paste a Google file link" className="min-w-48 flex-1 rounded-lg border border-slate-200 p-2" /><button className={button} disabled={busy || editors.length > 0 || !url.trim()} onClick={() => connect(false)}>Connect and read comments</button></div>
        <p className="mt-2">A link lets Leo read comments. Select the file with Google Picker to grant permission for replies and resolutions.</p>
      </details>
      {(!setup.pickerReady || !setup.permissionReady) && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        Reply/resolve setup: {!setup.enabled ? "enable GOOGLE_DRIVE_COMMENTS_ENABLED; " : ""}{!setup.pickerReady ? "configure GOOGLE_PICKER_API_KEY and GOOGLE_CLOUD_PROJECT_NUMBER; " : ""}{!setup.permissionReady ? "sign in again after setup to grant selected-file permission." : ""}
        {setup.enabled && !setup.permissionReady && <button className={`${button} ml-2`} onClick={() => signIn("google", { callbackUrl: "/attention#drive-comments" })}>Reconnect Google</button>}
      </div>}
      {view && <>
        <div className="flex flex-wrap items-center justify-between gap-2"><a className="text-sm font-semibold text-emerald-700 underline" href={fileLink(view.file.id)} target="_blank" rel="noreferrer">{view.file.name} <ExternalLink size={13} className="inline" /></a><span className="text-sm text-slate-500">{visible.length} of {view.comments.length} comments</span></div>
        {!view.canWrite && <p className="text-sm text-amber-800">{view.writeReason}</p>}
        <div className="flex flex-wrap gap-2">{[["active", "Open"], ["needs_response", "Needs response"], ["no_action", "No action needed"], ["all", "All / resolved"]].map(([value, label]) => <button key={value} className={filter === value ? primary : button} disabled={editors.length > 0} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        <fieldset disabled={busy} className="space-y-3">{visible.map((comment) => <CommentItem key={`${view.file.id}:${comment.id}`} comment={comment} view={view} refresh={refresh} editing={(id, open) => setEditors((current) => open ? [...new Set([...current, id])] : current.filter((value) => value !== id))} />)}</fieldset>
        {!visible.length && <p className="py-3 text-sm text-slate-500">No comments in this view.</p>}
      </>}
      {!view && <p className="text-sm text-slate-500">Choose a connected file or add a file link to get started. Files and subfolders are not added automatically.</p>}
    </>}
  </section>;
}
