import { supabase } from "./supabase";

// Backlog / "later list" — ideas and someday items, not yet tasks.
export interface BacklogItem {
  id: string;
  content: string;
  source: string | null;
  archived: boolean;
  created_at: string;
}

export async function fetchBacklog(
  includeArchived = false,
): Promise<BacklogItem[]> {
  let q = supabase
    .from("backlog_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (!includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) {
    console.warn("fetchBacklog:", error.message);
    return [];
  }
  return (data || []) as BacklogItem[];
}

export async function addBacklogItem(
  content: string,
  source: string | null = null,
): Promise<BacklogItem | null> {
  const { data, error } = await supabase
    .from("backlog_items")
    .insert({ content, source })
    .select()
    .single();
  if (error) {
    console.warn("addBacklogItem:", error.message);
    return null;
  }
  return data as BacklogItem;
}

export async function setBacklogArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("backlog_items")
    .update({ archived })
    .eq("id", id);
  if (error) console.warn("setBacklogArchived:", error.message);
}

export async function deleteBacklogItem(id: string): Promise<void> {
  const { error } = await supabase.from("backlog_items").delete().eq("id", id);
  if (error) console.warn("deleteBacklogItem:", error.message);
}
