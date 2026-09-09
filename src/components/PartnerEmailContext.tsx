"use client";

import { useEffect, useState } from "react";
import { readJsonResponse } from "@/lib/http";
import EmailText from "./EmailText";
import type { ResponseStatus } from "@/types/partner-response";

interface EmailMessage {
  id: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  body: string;
  cleanBody: string;
  snippet: string;
  hasQuotedContent: boolean;
  isOwnMessage?: boolean;
}
interface EmailThread { id: string; messages: EmailMessage[] }

function MessageContent({ message }: { message: EmailMessage }) {
  const date = new Date(message.date);
  return <div className="space-y-3 p-4">
    <div className="space-y-1 break-words text-xs text-slate-500">
      <p><span className="font-semibold">From:</span> {message.from}</p>
      <p><span className="font-semibold">To:</span> {message.to || "Not available"}</p>
      {message.cc && <p><span className="font-semibold">Cc:</span> {message.cc}</p>}
      <p>{Number.isNaN(date.valueOf()) ? message.date || "Date unavailable" : date.toLocaleString()}</p>
      <p>{message.subject || "No subject"}</p>
    </div>
    <EmailText text={message.cleanBody || message.body || message.snippet || "No readable message text is available. Open Mail to view the original."} />
    {message.hasQuotedContent && <details className="text-xs text-slate-500">
      <summary className="cursor-pointer font-medium">Show full text including quoted replies</summary>
      <div className="mt-3"><EmailText text={message.body || message.snippet} /></div>
    </details>}
  </div>;
}

export function EmailConversation({ thread, basedOnMessageId, queueStatus }: { thread: EmailThread; basedOnMessageId: string | null; queueStatus?: ResponseStatus }) {
  const latest = thread.messages.at(-1);
  if (!latest) return <p className="p-4 text-sm text-slate-500">No messages were returned for this conversation.</p>;
  const sourceFound = thread.messages.some((message) => message.id === basedOnMessageId);
  return <div>
    {latest.isOwnMessage ? <p role="status" className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      {queueStatus === "handled" ? "Your reply is the latest message. This conversation is marked no follow-up needed." : "You’ve already replied—your reply is the latest message. Waiting for the partner."} Any saved draft is retained for reference, not another reply to send.
    </p> : basedOnMessageId && latest.id !== basedOnMessageId && <p role="status" className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {sourceFound ? "There are newer messages than the one this draft was based on. Review them before replying." : "The message this draft was based on is not in the available conversation. Review the latest email before using this draft."}
    </p>}
    <div className="max-h-[32rem] overflow-y-auto overscroll-contain">
      <div className="border-b border-slate-100">
        <p className="px-4 pt-4 text-xs font-semibold text-emerald-800">{latest.isOwnMessage ? "Your latest sent reply" : "Latest email"}{latest.id === basedOnMessageId ? " · Draft based on this message" : ""}</p>
        <MessageContent message={latest} />
      </div>
      {thread.messages.length > 1 && <details open={!latest.isOwnMessage && sourceFound && latest.id !== basedOnMessageId} className="p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-600">Earlier messages ({thread.messages.length - 1})</summary>
        <div className="mt-3 space-y-3">{thread.messages.slice(0, -1).reverse().map((message) => <details key={message.id} open={message.id === basedOnMessageId} className="rounded-lg border border-slate-200">
          <summary className="cursor-pointer break-words px-4 py-3 text-sm text-slate-600">{message.from}{message.id === basedOnMessageId ? " · Draft based on this message" : ""}</summary>
          <MessageContent message={message} />
        </details>)}</div>
      </details>}
    </div>
  </div>;
}

export default function PartnerEmailContext({ threadId, basedOnMessageId, queueStatus, onRefreshStatus, refreshDisabled = false }: { threadId: string; basedOnMessageId: string | null; queueStatus?: ResponseStatus; onRefreshStatus?: () => Promise<void>; refreshDisabled?: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ threadId: string; attempt: number; thread?: EmailThread; error?: string } | null>(null);
  const current = result?.threadId === threadId && result.attempt === attempt ? result : null;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refresh = async () => {
    if (refreshDisabled || refreshing) return;
    setRefreshing(true); setRefreshError(null);
    try {
      // Initial reads stay read-only. Only this explicit click reconciles the
      // queue; the editor disables it while there are unsaved changes.
      await onRefreshStatus?.();
      setAttempt((value) => value + 1);
    } catch { setRefreshError("Reply status could not be refreshed. Your edits are unchanged; try again."); }
    finally { setRefreshing(false); }
  };
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/mail/thread?id=${encodeURIComponent(threadId)}`, { cache: "no-store", signal: controller.signal });
        const body = await readJsonResponse<{ thread: EmailThread; error: string }>(response);
        if (!response.ok) throw new Error(body.error || "Could not load the email conversation.");
        if (!body.thread || body.thread.id !== threadId || !Array.isArray(body.thread.messages)) throw new Error("The email conversation was incomplete. Try loading it again.");
        if (!controller.signal.aborted) setResult({ threadId, attempt, thread: body.thread });
      } catch (caught) {
        if (!controller.signal.aborted) setResult({ threadId, attempt, error: caught instanceof Error ? caught.message : "Could not load this conversation." });
      }
    }
    void load();
    return () => controller.abort();
  }, [threadId, attempt]);
  return <section aria-label="Email conversation" className="overflow-hidden rounded-xl border border-emerald-100 bg-white">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-emerald-50/40 px-4 py-3">
      <h4 className="font-semibold text-slate-800">Email conversation</h4>
      <button type="button" disabled={!current || refreshDisabled || refreshing} onClick={() => void refresh()} className="text-xs font-semibold text-emerald-800 disabled:opacity-50">{refreshing ? "Refreshing…" : "Refresh emails"}</button>
    </div>
    {refreshDisabled && <p className="px-4 py-2 text-xs text-slate-500">Finish the current action or save your edits before refreshing emails and reply status.</p>}
    {refreshError && <p role="alert" className="px-4 py-2 text-sm text-amber-800">{refreshError}</p>}
    {!current && <p role="status" className="p-4 text-sm text-slate-500">Loading this conversation…</p>}
    {current?.error && <p role="alert" className="p-4 text-sm text-amber-800">{current.error} Your draft is unchanged. <button type="button" onClick={() => setAttempt((value) => value + 1)} className="font-semibold underline">Try again</button></p>}
    {current?.thread && <EmailConversation thread={current.thread} basedOnMessageId={basedOnMessageId} queueStatus={queueStatus} />}
  </section>;
}
