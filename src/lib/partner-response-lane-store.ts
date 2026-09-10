import "server-only";
import { responseDb, storeError } from "./partner-response-store";
import { isActionNeeded, type ResponseLaneItem } from "./partner-response-lane";

type LaneRow = ResponseLaneItem & { thread_id: string; received_at: string | null };

// Classify before pagination so action items beyond the first page are visible.
// Read only routing metadata, never email bodies or drafts. Keyset pagination
// also works when Supabase's configured row cap is smaller than our batch size.
export async function getInputLaneIndex() {
  const rows: LaneRow[] = [];
  let cursor: string | null = null;
  const db = responseDb();
  for (;;) {
    let query = db.from("partner_responses")
      .select("thread_id,received_at,status,message_id,response_assessment,response_correction")
      .eq("status", "needs_input").order("thread_id").limit(500);
    if (cursor) query = query.gt("thread_id", cursor);
    const { data, error } = await query;
    if (error) storeError(error);
    const batch = (data ?? []) as LaneRow[];
    if (!batch.length) break;
    const next = batch[batch.length - 1].thread_id;
    if (cursor && next <= cursor) throw new Error("Could not finish reading response filters. Reload the queue.");
    rows.push(...batch);
    cursor = next;
  }
  rows.sort((a, b) => {
    const dateOrder = (b.received_at ? Date.parse(b.received_at) : -Infinity)
      - (a.received_at ? Date.parse(a.received_at) : -Infinity);
    return dateOrder || (a.thread_id < b.thread_id ? -1 : a.thread_id > b.thread_id ? 1 : 0);
  });
  return {
    action_needed: rows.filter(isActionNeeded).map((row) => row.thread_id),
    needs_input: rows.filter((row) => !isActionNeeded(row)).map((row) => row.thread_id),
  };
}
