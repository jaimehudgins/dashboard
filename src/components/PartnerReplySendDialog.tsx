"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { readJsonResponse } from "@/lib/http";
import type { PartnerResponse } from "@/types/partner-response";

interface Preview { to: string; subject: string; messageId: string; draft: string; version: number }

export default function PartnerReplySendDialog({ item, onClose, onSent }: {
  item: PartnerResponse;
  onClose: (attempted: boolean) => void;
  onSent: (notice: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sendLock = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/partner-responses/send?threadId=${encodeURIComponent(item.thread_id)}&version=${item.version}`, { cache: "no-store", signal: controller.signal });
        const result = await readJsonResponse<Preview & { error?: string }>(response);
        if (!response.ok) throw new Error(result.error || "Could not verify the reply details.");
        if (!result.to || !result.messageId || typeof result.subject !== "string" || result.version !== item.version || result.draft !== item.draft) throw new Error("The draft changed. Reopen this conversation before sending.");
        if (!controller.signal.aborted) setPreview({ to: result.to, subject: result.subject, messageId: result.messageId, version: result.version, draft: result.draft });
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not review this reply.");
      }
    }
    void load();
    return () => { controller.abort(); element?.close(); };
  }, [item.thread_id, item.version, item.draft]);

  const send = async () => {
    if (!preview || sendLock.current || attempted) return;
    sendLock.current = true;
    setSending(true); setAttempted(true); setError(null);
    try {
      const response = await fetch("/api/partner-responses/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: item.thread_id, version: preview.version, confirmed: true, expectedMessageId: preview.messageId, expectedTo: preview.to, expectedSubject: preview.subject }),
      });
      const result = await readJsonResponse<{ ok?: boolean; messageId?: string; warning?: string; error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Sending was not confirmed. Check Mail before trying again.");
      if (!result.ok || !result.messageId) throw new Error("No send receipt was returned. Check Mail before trying again.");
      onSent(result.warning || `Reply sent to ${preview.to}. Moved to Waiting / follow-up.`);
    } catch (caught) {
      setError(`${caught instanceof Error ? caught.message : "Sending was not confirmed."} If delivery is uncertain, check Mail or Gmail before retrying; Leo will not retry automatically.`);
    } finally { setSending(false); }
  };

  return <dialog ref={dialog} aria-labelledby="reply-send-title" onCancel={(event) => { event.preventDefault(); if (!sending) onClose(attempted); }} className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-emerald-100 bg-white p-6 text-slate-800 shadow-xl backdrop:bg-slate-900/40">
    <h3 id="reply-send-title" className="text-lg font-semibold">Review &amp; send reply</h3>
    <p className="mt-2 text-sm text-slate-500">Your edits are saved. Nothing is sent until you choose Confirm &amp; send.</p>
    {!preview && !error && <p role="status" className="my-5 text-sm">Checking the latest message and reply recipient…</p>}
    {preview && <div className="my-5 space-y-3">
      <p className="break-words text-sm"><span className="font-semibold">To:</span> {preview.to}</p>
      <p className="break-words text-sm"><span className="font-semibold">Subject:</span> {preview.subject}</p>
      <p className="text-xs text-slate-500">Reply to this recipient only, not reply-all. Use Mail for other email actions.</p>
      <div aria-label="Reply to send" className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed">{preview.draft}</div>
      <p className="text-xs text-slate-500">Leo will recheck for newer messages before sending. Sending does not complete any linked tasks.</p>
    </div>}
    {error && <p role="alert" className="my-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error} <a href={`/mail?thread=${encodeURIComponent(item.thread_id)}`} className="font-semibold underline">Open thread in Mail</a></p>}
    <div className="mt-5 flex flex-wrap justify-end gap-3">
      <button type="button" disabled={sending} onClick={() => onClose(attempted)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-50">{attempted ? "Back to queue" : "Back to editing"}</button>
      <button type="button" disabled={!preview || Boolean(error) || attempted || sending} onClick={() => void send()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{sending ? "Sending…" : "Confirm & send"}</button>
    </div>
  </dialog>;
}
