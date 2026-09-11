"use client";

import { useRef, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { readJsonResponse } from "@/lib/http";
import type { PartnerResponse } from "@/types/partner-response";
import { archiveConfirmation } from "@/lib/partner-archive";

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
    if (lock.current || (item.status === "handled" && !item.in_inbox)) return;
    if (!window.confirm(archiveConfirmation(item))) return;
    lock.current = true;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/partner-responses/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: item.thread_id, version: item.version, expectedMessageId: item.message_id, confirmed: true, acknowledgeFollowUp: true }),
      });
      const result = await readJsonResponse<{ ok?: boolean; notice?: string; error?: string }>(response);
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not confirm archiving. Check Gmail and refresh before trying again.");
      onArchived(result.notice || "Archived. Refresh the queue to verify its latest status.");
    } catch (caught) {
      setError(`${caught instanceof Error ? caught.message : "Could not confirm archiving."} No automatic retry was made. Check Gmail, then refresh this list before retrying.`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return <div className="shrink-0 px-5 pb-4 sm:w-44 sm:pl-0 sm:pt-4">
    <button type="button" onClick={() => void archive()} disabled={busy || (item.status === "handled" && !item.in_inbox)}
      aria-label={item.status === "handled" && !item.in_inbox ? `${item.subject || "Conversation"} is archived` : `Archive ${item.subject || "conversation"} from Gmail and Attention`}
      title="Remove from Gmail’s inbox and active Attention; keep notes, drafts, and Work tasks"
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
      {busy ? "Archiving…" : item.status === "handled" && !item.in_inbox ? "Archived" : "Archive"}
    </button>
    {error && <div className="mt-2 text-xs text-amber-800">
      <p role="alert">{error}</p>
      <button type="button" onClick={() => void onRefresh()} className="mt-1 font-semibold underline">Refresh list</button>
    </div>}
  </div>;
}
