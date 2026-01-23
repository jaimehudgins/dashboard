import { createClient } from "@supabase/supabase-js";

// CRM Supabase instance - for two-way task sync
const crmSupabaseUrl = "https://hianqlrkebrwghkswqcp.supabase.co";
const crmSupabaseAnonKey = "sb_publishable_4apqjClLEcaedUjg4kG0KQ_jyZk7g61";

export const crmSupabase = createClient(crmSupabaseUrl, crmSupabaseAnonKey);

// CRM Database types
export interface CrmPartner {
  id: string;
  name: string;
  status: string;
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
