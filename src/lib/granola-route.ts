import { supabase } from "./supabase";
import { crmSupabase, isCrmConfigured } from "./crm-supabase";

// Confirm/dismiss the tasks Margaret extracted from a meeting. Partner-linked
// tasks route to the CRM follow_up_tasks (team-visible); personal tasks land in
// the dashboard tasks table.

export async function dismissExtractedTask(id: string): Promise<void> {
  const { error } = await supabase
    .from("granola_extracted_tasks")
    .update({ status: "dismissed" })
    .eq("id", id);
  if (error) throw error;
}

interface ConfirmEdits {
  task?: string;
  due_date?: string | null;
  partner_id?: string | null;
  partner_name?: string | null;
}

export async function confirmExtractedTask(
  id: string,
  edits: ConfirmEdits = {},
): Promise<{ routedTo: "crm" | "dashboard" }> {
  const { data: row, error: loadErr } = await supabase
    .from("granola_extracted_tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !row) throw new Error("Extracted task not found");

  const task = (edits.task?.trim() || (row.task as string)).trim();
  const due =
    edits.due_date !== undefined ? edits.due_date : (row.due_date as string | null);
  const partnerId =
    edits.partner_id !== undefined
      ? edits.partner_id
      : (row.partner_id as string | null);
  const partnerName =
    edits.partner_name !== undefined
      ? edits.partner_name
      : (row.partner_name as string | null);

  const { data: mtg } = await supabase
    .from("granola_meetings")
    .select("title")
    .eq("id", row.meeting_id)
    .maybeSingle();
  const meetingTitle = (mtg?.title as string) || "meeting";

  const nowIso = new Date().toISOString();
  let routedTo: "crm" | "dashboard";

  if (partnerId && isCrmConfigured) {
    const { error } = await crmSupabase.from("follow_up_tasks").insert({
      id: crypto.randomUUID(),
      partner_id: partnerId,
      touchpoint_id: null,
      task,
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
    const quote = row.source_quote ? ` — “${row.source_quote as string}”` : "";
    const { error } = await supabase.from("tasks").insert({
      id: crypto.randomUUID(),
      title: task,
      description: `From meeting: ${meetingTitle}${quote}`,
      priority: "medium",
      status: "pending",
      due_date: due || null,
      created_at: nowIso,
      tag_ids: [],
      reminders: [],
    });
    if (error) throw error;
    routedTo = "dashboard";
  }

  const { error: updErr } = await supabase
    .from("granola_extracted_tasks")
    .update({
      status: "confirmed",
      routed_to: routedTo,
      task,
      due_date: due || null,
      partner_id: partnerId,
      partner_name: partnerName,
    })
    .eq("id", id);
  if (updErr) throw updErr;

  return { routedTo };
}
