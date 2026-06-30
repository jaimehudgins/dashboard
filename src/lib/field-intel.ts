import { supabase } from "./supabase";

export interface FieldSource {
  id: string;
  name: string;
  url: string;
  active: boolean;
  created_at: string;
}

export interface FieldSignal {
  id: string;
  source_name: string | null;
  title: string;
  summary: string | null;
  url: string | null;
  relevance: number;
  tags: string[];
  saved: boolean;
  published_at: string | null;
  captured_at: string;
}

export async function fetchSources(): Promise<FieldSource[]> {
  const { data } = await supabase
    .from("field_sources")
    .select("*")
    .order("created_at", { ascending: true });
  return (data || []) as FieldSource[];
}

export async function addSource(name: string, url: string): Promise<void> {
  await supabase.from("field_sources").insert({ name, url });
}

export async function setSourceActive(id: string, active: boolean): Promise<void> {
  await supabase.from("field_sources").update({ active }).eq("id", id);
}

export async function deleteSource(id: string): Promise<void> {
  await supabase.from("field_sources").delete().eq("id", id);
}

export async function fetchSignals(savedOnly = false): Promise<FieldSignal[]> {
  let q = supabase
    .from("field_signals")
    .select("*")
    .order("relevance", { ascending: false })
    .order("captured_at", { ascending: false })
    .limit(100);
  if (savedOnly) q = q.eq("saved", true);
  const { data } = await q;
  return (data || []) as FieldSignal[];
}

export async function toggleSaved(id: string, saved: boolean): Promise<void> {
  await supabase.from("field_signals").update({ saved }).eq("id", id);
}

export async function deleteSignal(id: string): Promise<void> {
  await supabase.from("field_signals").delete().eq("id", id);
}
