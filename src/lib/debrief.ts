import { supabase } from "./supabase";

export interface Debrief {
  debrief_date: string;
  energy: number | null;
  went_well: string | null;
  note_for_later: string | null;
}

export async function fetchDebrief(dateYMD: string): Promise<Debrief | null> {
  const { data, error } = await supabase
    .from("daily_debrief")
    .select("*")
    .eq("debrief_date", dateYMD)
    .maybeSingle();
  if (error) {
    console.warn("fetchDebrief:", error.message);
    return null;
  }
  return (data as Debrief) || null;
}

export async function saveDebrief(d: {
  date: string;
  energy: number | null;
  wentWell: string;
  noteForLater: string;
}): Promise<void> {
  const { error } = await supabase.from("daily_debrief").upsert(
    {
      debrief_date: d.date,
      energy: d.energy,
      went_well: d.wentWell.trim() || null,
      note_for_later: d.noteForLater.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "debrief_date" },
  );
  if (error) throw error;
}
