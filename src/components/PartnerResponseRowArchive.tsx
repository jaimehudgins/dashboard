"use client";

import { useRef, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { readJsonResponse } from "@/lib/http";
import type { PartnerResponse } from "@/types/partner-response";

interface Props {
  item: PartnerResponse;
  onArchived: (notice: string) => void;
  onRefresh: () => Promise<void>;
}

export default function PartnerResponseRowArchive({ item, onArchived, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  const archive = async () => {
    if (lock.current || !item.in_inbox) return;
    if (!window.confirm(`Archive “${item.subject || "this conversation"}” in Gmail? This removes it from the inbox, not from Leo’s follow-up queue. Nothing is deleted or marked handled.`)) return;
    lock.current = true;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/partner-responses/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: item.thread_id, version: item.version, expectedMessageId: item.message_id, confirmed: true }),
      });
      const result = await readJsonResponse<{ ok?: boolean; notice?: string; error?: string }>(response);
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not confirm archiving. Check Gmail and refresh before trying again.");
      onArchived(result.notice || "Archived in Gmail. Leo follow-up status and saved work are unchanged.");
    } catch (caught) {
      setError(`${caught instanceof Error ? caught.message : "Could not confirm archiving."} No automatic retry was made. Check Gmail, then refresh this list before retrying.`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return <div className="shrink-0 px-5 pb-4 sm:w-44 sm:pl-0 sm:pt-4">
    <button type="button" onClick={() => void archive()} disabled={busy || !item.in_inbox}
      aria-label={item.in_inbox ? `Archive ${item.subject || "conversation"} in Gmail` : `${item.subject || "Conversation"} is not in the Gmail inbox`}
      title="Archive in Gmail only; Leo follow-up status is unchanged"
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
      {busy ? "Archiving…" : item.in_inbox ? "Archive" : "Not in inbox"}
    </button>
    {error && <div className="mt-2 text-xs text-amber-800">
      <p role="alert">{error}</p>
      <button type="button" onClick={() => void onRefresh()} className="mt-1 font-semibold underline">Refresh list</button>
    </div>}
  </div>;
}
