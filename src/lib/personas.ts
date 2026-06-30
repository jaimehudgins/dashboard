import { supabase } from "./supabase";

export interface Persona {
  id: string;
  name: string;
  description: string | null;
  role_context: string | null;
  voice: string | null;
  created_at: string;
}

export async function fetchPersonas(): Promise<Persona[]> {
  const { data } = await supabase
    .from("personas")
    .select("*")
    .order("created_at", { ascending: true });
  return (data || []) as Persona[];
}

export async function createPersona(
  p: Pick<Persona, "name" | "description" | "role_context" | "voice">,
): Promise<void> {
  await supabase.from("personas").insert(p);
}

export async function deletePersona(id: string): Promise<void> {
  await supabase.from("personas").delete().eq("id", id);
}
