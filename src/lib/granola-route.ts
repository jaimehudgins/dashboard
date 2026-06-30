import { supabase } from "./supabase";
import { crmSupabase, isCrmConfigured } from "./crm-supabase";

// Route the items Margaret extracted from a meeting to their chosen home, or
// dismiss them. Partner-linked tasks go to the CRM follow_up_tasks
// (team-visible); everything else lands in the relevant dashboard surface.

export type Destination =
  | "task"
  | "quick_task"
  | "note"
  | "backlog"
  | "ignore";

export async function dismissExtractedTask(id: string): Promise<void> {
  const { error } = await supabase
    .from("granola_extracted_tasks")
    .update({ status: "dismissed" })
    .eq("id", id);
  if (error) throw error;
}

interface RouteEdits {
  destination?: Destination;
  task?: string;
  due_date?: string | null;
  partner_id?: string | null;
  partner_name?: string | null;
}

export async function routeExtractedTask(
  id: string,
  edits: RouteEdits = {},
): Promise<{ routedTo: string }> {
  const { data: row, error: loadErr } = await supabase
    .from("granola_extracted_tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) throw new Error("Extracted item not found");

  const text = (edits.task?.trim() || (row.task as string)).trim();
  const due =
    edits.due_date !== undefined
      ? edits.due_date
      : (row.due_date as string | null);
  const partnerId =
    edits.partner_id !== undefined
      ? edits.partner_id
      : (row.partner_id as string | null);
  const partnerName =
    edits.partner_name !== undefined
      ? edits.partner_name
      : (row.partner_name as string | null);
  const destination: Destination =
    edits.destination ||
    (row.suggested_destination as Destination) ||
    "task";

  if (destination === "ignore") {
    await dismissExtractedTask(id);
    return { routedTo: "ignored" };
  }

  const { data: mtg } = await supabase
    .from("granola_meetings")
    .select("title")
    .eq("id", row.meeting_id)
    .maybeSingle();
  const meetingTitle = (mtg?.title as string) || "meeting";
  const quote = row.source_quote ? ` — “${row.source_quote as string}”` : "";
  const nowIso = new Date().toISOString();
  let routedTo: string;

  if (destination === "task") {
    if (partnerId && isCrmConfigured) {
      const { error } = await crmSupabase.from("follow_up_tasks").insert({
        id: crypto.randomUUID(),
        partner_id: partnerId,
        touchpoint_id: null,
        task: text,
        due_date: due || null,
        completed: false,
        status: "Not Started",
        notes: `From meeting: ${meetingTitle} (via Margaret)`,
        created_at: nowIso,
        updated_at: nowIso,
      });
      if (error) throw error;
      routedTo = "crm";
    } else {
      const { error } = await supabase.from("tasks").insert({
        id: crypto.randomUUID(),
        title: text,
        description: `From meeting: ${meetingTitle}${quote}`,
        priority: "medium",
        status: "pending",
        due_date: due || null,
        created_at: nowIso,
        tag_ids: [],
        reminders: [],
      });
      if (error) throw error;
      routedTo = "task";
    }
  } else if (destination === "quick_task") {
    const { error } = await supabase.from("quick_tasks").insert({
      id: crypto.randomUUID(),
      task: text,
      due_date: due || null,
      notes: `From meeting: ${meetingTitle}`,
      status: "not_started",
      display_order: 0,
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (error) throw error;
    routedTo = "quick_task";
  } else if (destination === "note") {
    const { error } = await supabase.from("sticky_notes").insert({
      id: crypto.randomUUID(),
      title: meetingTitle,
      content: text,
      color: "yellow",
      display_order: 0,
      position_x: 20,
      position_y: 20,
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (error) throw error;
    routedTo = "note";
  } else {
    // backlog
    const { error } = await supabase.from("backlog_items").insert({
      content: text,
      source: `Meeting: ${meetingTitle}`,
    });
    if (error) throw error;
    routedTo = "backlog";
  }

  const { error: updErr } = await supabase
    .from("granola_extracted_tasks")
    .update({
      status: "confirmed",
      routed_to: routedTo,
      task: text,
      due_date: due || null,
      partner_id: partnerId,
      partner_name: partnerName,
    })
    .eq("id", id);
  if (updErr) throw updErr;

  return { routedTo };
}
