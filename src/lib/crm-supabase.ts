import { createClient } from "@supabase/supabase-js";

// CRM Supabase instance - for two-way task sync
const crmSupabaseUrl = process.env.NEXT_PUBLIC_CRM_SUPABASE_URL || "https://placeholder.supabase.co";
const crmSupabaseAnonKey = process.env.NEXT_PUBLIC_CRM_SUPABASE_ANON_KEY || "placeholder";

export const isCrmConfigured =
  crmSupabaseUrl !== "https://placeholder.supabase.co" &&
  crmSupabaseAnonKey !== "placeholder" &&
  !!process.env.NEXT_PUBLIC_CRM_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_CRM_SUPABASE_ANON_KEY;

export const crmSupabase = createClient(crmSupabaseUrl, crmSupabaseAnonKey);

// CRM Database types
export interface CrmPartner {
  id: string;
  name: string;
  status: string;
  priority?: string | null;
  relationship_health?: string | null;
  renewal_status?: string | null;
  last_contact_date?: string | null;
  next_follow_up?: string | null;
  proposal_deadline?: string | null;
  city_state?: string | null;
  district?: string | null;
  willow_staff_lead?: string | null;
  summary?: string | null;
  pain_points?: string[] | null;
  onboarding_step?: string | null;
  updated_at?: string | null;
}

export interface CrmContact {
  id: string;
  partner_id: string;
  name: string;
  role?: string | null;
  email: string;
  phone?: string | null;
  is_primary_contact?: boolean | null;
}

export interface CrmTouchpoint {
  id: string;
  partner_id: string;
  date: string;
  author?: string | null;
  title?: string | null;
  notes: string;
  next_steps?: string | null;
  next_steps_due_date?: string | null;
  type: string;
}

export interface CrmImportantDate {
  id: string;
  partner_id: string;
  title: string;
  date: string;
  notes?: string | null;
}

export interface CrmFollowUpTask {
  id: string;
  touchpoint_id: string | null;
  partner_id: string | null;
  task: string;
  due_date: string | null;
  completed: boolean;
  status: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CrmOnboardingTask {
  id: string;
  partner_id: string;
  title: string;
  status: string;
  order_index: number;
  is_custom?: boolean;
  due_date?: string;
  created_at?: string;
}

export type TaskStatus = "Not Started" | "In Progress" | "Waiting" | "Paused" | "Complete";

export const TASK_STATUS_OPTIONS: TaskStatus[] = [
  "Not Started",
  "In Progress",
  "Waiting",
  "Paused",
  "Complete",
];

export const taskStatusColors: Record<TaskStatus, string> = {
  "Not Started": "bg-gray-100 text-gray-800",
  "In Progress": "bg-blue-100 text-blue-800",
  "Waiting": "bg-yellow-100 text-yellow-800",
  "Paused": "bg-orange-100 text-orange-800",
  "Complete": "bg-green-100 text-green-800",
};

// Returns partner_ids that already have an open (incomplete) follow-up task,
// so callers can avoid creating duplicates.
export async function fetchOpenFollowUpPartnerIds(): Promise<Set<string>> {
  if (!isCrmConfigured) return new Set();
  const { data, error } = await crmSupabase
    .from("follow_up_tasks")
    .select("partner_id")
    .eq("completed", false);
  if (error) {
    console.warn("Could not load open follow-ups:", error.message);
    return new Set();
  }
  return new Set(
    (data || [])
      .map((r) => (r as { partner_id: string | null }).partner_id)
      .filter((id): id is string => !!id),
  );
}

// Creates a follow-up task tagged to a partner. It lands on the partner's CRM
// page and round-trips into Leo's unified task table via the existing bridge.
export async function createPartnerFollowUp(opts: {
  partnerId: string;
  partnerName: string;
  dueInDays?: number;
}): Promise<void> {
  const due = new Date();
  due.setDate(due.getDate() + (opts.dueInDays ?? 2));
  const nowIso = new Date().toISOString();

  const { error } = await crmSupabase.from("follow_up_tasks").insert({
    id: crypto.randomUUID(),
    partner_id: opts.partnerId,
    touchpoint_id: null,
    task: `Follow up with ${opts.partnerName}`,
    due_date: due.toISOString().split("T")[0],
    completed: false,
    status: "Not Started",
    notes: "Created from Leo morning brief",
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (error) throw error;
}
