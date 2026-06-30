import { supabase } from "./supabase";

export type DraftStatus =
  | "in_progress"
  | "ready_to_publish"
  | "published"
  | "archived";

export interface WritingDraft {
  id: string;
  title: string;
  content: string;
  status: DraftStatus;
  audience: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export async function fetchDrafts(): Promise<WritingDraft[]> {
  const { data, error } = await supabase
    .from("writing_drafts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("fetchDrafts:", error.message);
    return [];
  }
  return (data || []) as WritingDraft[];
}

export async function createDraft(): Promise<WritingDraft | null> {
  const { data, error } = await supabase
    .from("writing_drafts")
    .insert({ title: "", content: "", status: "in_progress" })
    .select()
    .single();
  if (error) {
    console.warn("createDraft:", error.message);
    return null;
  }
  return data as WritingDraft;
}

export async function updateDraft(
  id: string,
  patch: Partial<
    Pick<WritingDraft, "title" | "content" | "status" | "audience" | "tags">
  >,
): Promise<void> {
  const { error } = await supabase
    .from("writing_drafts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.warn("updateDraft:", error.message);
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await supabase.from("writing_drafts").delete().eq("id", id);
  if (error) console.warn("deleteDraft:", error.message);
}
