import { supabase } from "./supabase";

// Leo's persistent structured memory (the `memory` table from Phase 0).
// Used by the MCP memory tools and by memory-injection on new chats.

export type MemoryEntityType =
  | "partner"
  | "project"
  | "person"
  | "topic"
  | "global";

export interface MemoryRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  fact: string;
  source_quote: string | null;
  importance: number;
  created_at: string;
  expires_at: string | null;
}

export async function rememberFact(input: {
  entityType: MemoryEntityType;
  entityId?: string | null;
  fact: string;
  sourceQuote?: string | null;
  importance?: number;
  expiresAt?: string | null;
}): Promise<MemoryRow> {
  const { data, error } = await supabase
    .from("memory")
    .insert({
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      fact: input.fact,
      source_quote: input.sourceQuote ?? null,
      importance: input.importance ?? 5,
      expires_at: input.expiresAt ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MemoryRow;
}

export async function recallMemories(filter: {
  entityType?: string;
  entityId?: string;
  query?: string;
  limit?: number;
}): Promise<MemoryRow[]> {
  const nowISO = new Date().toISOString();
  let req = supabase
    .from("memory")
    .select("*")
    // Exclude expired memories.
    .or(`expires_at.is.null,expires_at.gt.${nowISO}`)
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 25);

  if (filter.entityType) req = req.eq("entity_type", filter.entityType);
  if (filter.entityId) req = req.eq("entity_id", filter.entityId);
  if (filter.query) req = req.ilike("fact", `%${filter.query}%`);

  const { data, error } = await req;
  if (error) throw error;
  return (data || []) as MemoryRow[];
}

export async function forgetMemory(id: string): Promise<void> {
  const { error } = await supabase.from("memory").delete().eq("id", id);
  if (error) throw error;
}
