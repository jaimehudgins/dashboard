import { supabase } from "./supabase";

// Free-form focus notes (intentions that aren't tasks) for a given day.
export interface FocusItem {
  id: string;
  focus_date: string; // YYYY-MM-DD
  text: string;
  done: boolean;
  created_at: string;
}

export async function fetchFocusItems(dateYMD: string): Promise<FocusItem[]> {
  const { data, error } = await supabase
    .from("focus_items")
    .select("*")
    .eq("focus_date", dateYMD)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("fetchFocusItems:", error.message);
    return [];
  }
  return (data || []) as FocusItem[];
}

export async function addFocusItem(
  dateYMD: string,
  text: string,
): Promise<FocusItem | null> {
  const { data, error } = await supabase
    .from("focus_items")
    .insert({ focus_date: dateYMD, text })
    .select()
    .single();
  if (error) {
    console.warn("addFocusItem:", error.message);
    return null;
  }
  return data as FocusItem;
}

export async function toggleFocusItem(id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from("focus_items")
    .update({ done })
    .eq("id", id);
  if (error) console.warn("toggleFocusItem:", error.message);
}

export async function deleteFocusItem(id: string): Promise<void> {
  const { error } = await supabase.from("focus_items").delete().eq("id", id);
  if (error) console.warn("deleteFocusItem:", error.message);
}
