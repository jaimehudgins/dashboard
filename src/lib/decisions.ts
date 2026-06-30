import { supabase } from "./supabase";

export type DecisionStatus = "open" | "reviewed" | "archived";

export interface Decision {
  id: string;
  decision: string;
  context: string | null;
  options: string | null;
  choice: string | null;
  reasoning: string | null;
  expected_outcome: string | null;
  actual_outcome: string | null;
  decided_at: string; // YYYY-MM-DD
  reviewed_at: string | null;
  status: DecisionStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type DecisionInput = Partial<
  Pick<
    Decision,
    | "decision"
    | "context"
    | "options"
    | "choice"
    | "reasoning"
    | "expected_outcome"
    | "actual_outcome"
    | "decided_at"
    | "reviewed_at"
    | "status"
    | "tags"
  >
>;

export async function fetchDecisions(): Promise<Decision[]> {
  const { data, error } = await supabase
    .from("decisions")
    .select("*")
    .order("decided_at", { ascending: false });
  if (error) {
    console.warn("fetchDecisions:", error.message);
    return [];
  }
  return (data || []) as Decision[];
}

export async function createDecision(
  input: DecisionInput,
): Promise<Decision | null> {
  const { data, error } = await supabase
    .from("decisions")
    .insert({ decision: input.decision || "", ...input })
    .select()
    .single();
  if (error) {
    console.warn("createDecision:", error.message);
    return null;
  }
  return data as Decision;
}

export async function updateDecision(
  id: string,
  patch: DecisionInput,
): Promise<void> {
  const { error } = await supabase
    .from("decisions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.warn("updateDecision:", error.message);
}

export async function deleteDecision(id: string): Promise<void> {
  const { error } = await supabase.from("decisions").delete().eq("id", id);
  if (error) console.warn("deleteDecision:", error.message);
}

// Days since the decision was made (for the "due for review" nudge).
export function daysSince(dateYMD: string): number {
  const d = new Date(`${dateYMD}T00:00:00`).getTime();
  return Math.floor((Date.now() - d) / 86400000);
}

// Open decisions at/after a review horizon (30/60/90 days) that haven't been
// reviewed — surfaced for retrospective.
export function dueForReview(decisions: Decision[]): Decision[] {
  return decisions
    .filter((d) => d.status === "open" && daysSince(d.decided_at) >= 30)
    .sort((a, b) => daysSince(b.decided_at) - daysSince(a.decided_at));
}
