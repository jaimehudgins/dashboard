import "server-only";
import { responseDb, storeError } from "./partner-response-store";
import { isActionNeeded, type ResponseLaneItem } from "./partner-response-lane";
import { calendarEmailKind, calendarEmailSection, type CalendarEnvelope } from "./calendar-email";

type LaneRow = ResponseLaneItem & CalendarEnvelope & { thread_id: string; received_at: string | null };

// Classify before pagination so action items beyond the first page are visible.
// Read only routing metadata, never email bodies or drafts. Keyset pagination
// also works when Supabase's configured row cap is smaller than our batch size.
export async function getResponseLaneIndex(policyReady: boolean) {
  const rows: LaneRow[] = [];
  let cursor: string | null = null;
  const db = responseDb();
  for (;;) {
    const table = db.from("partner_responses");
    const selected = policyReady
      ? table.select("thread_id,received_at,status,message_id,subject,sender,snippet,response_assessment,response_correction")
      : table.select("thread_id,received_at,status,message_id,subject,sender,snippet");
    let query = selected.neq("status", "handled").order("thread_id").limit(500);
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
  const index: Record<"needs_response" | "draft_ready" | "needs_input" | "waiting" | "action_needed" | "calendar" | "calendar_action" | "calendar_updates", string[]> = {
    needs_response: [], draft_ready: [], needs_input: [], waiting: [], action_needed: [],
    calendar: [], calendar_action: [], calendar_updates: [],
  };
  for (const row of rows) {
    if (calendarEmailKind(row)) {
      index.calendar.push(row.thread_id);
      index[calendarEmailSection(row)].push(row.thread_id);
    } else if (isActionNeeded(row)) index.action_needed.push(row.thread_id);
    else if (row.status !== "handled") index[row.status].push(row.thread_id);
  }
  return index;
}
