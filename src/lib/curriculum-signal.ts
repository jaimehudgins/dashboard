import { supabase } from "./supabase";

export interface CurriculumSignal {
  id: string;
  meeting_id: string | null;
  partner_id: string | null;
  partner_name: string | null;
  lesson_ref: string;
  sentiment: "positive" | "neutral" | "negative" | null;
  note: string | null;
  quote: string | null;
  meeting_date: string | null;
  captured_at: string;
}

export async function fetchCurriculumSignals(): Promise<CurriculumSignal[]> {
  const { data } = await supabase
    .from("curriculum_signals")
    .select("*")
    .order("meeting_date", { ascending: false })
    .limit(500);
  return (data || []) as CurriculumSignal[];
}
