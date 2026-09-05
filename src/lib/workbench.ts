export type Workstream =
  | "curriculum"
  | "partner"
  | "leadership"
  | "unassigned";

export type WorkRunStatus =
  | "researching"
  | "needs_input"
  | "draft_ready"
  | "reviewed"
  | "failed"
  | "human_only";

export type WorkRunDeliverable =
  | "assessment"
  | "draft"
  | "context_packet"
  | "human_only";

export type WorkRunConfidence = "high" | "medium" | "low";
export type NotificationTier = "immediate" | "digest" | "none";

export interface WorkSource {
  type: "task" | "project" | "drive" | "curriculum_repo" | "memory";
  title: string;
  url?: string;
  excerpt?: string;
  modifiedAt?: string;
}

export interface WorkRun {
  id: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string | null;
  workstream: Workstream;
  deliverableType: WorkRunDeliverable;
  status: WorkRunStatus;
  confidence: WorkRunConfidence;
  rationale: string | null;
  blockingQuestion: string | null;
  draftTitle: string | null;
  draft: string | null;
  sources: WorkSource[];
  notificationTier: NotificationTier;
  notificationReason: string | null;
  notificationSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toWorkRun(row: Record<string, unknown>): WorkRun {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    taskTitle: row.task_title as string,
    taskDescription: (row.task_description as string | null) ?? null,
    workstream: row.workstream as Workstream,
    deliverableType: row.deliverable_type as WorkRunDeliverable,
    status: row.status as WorkRunStatus,
    confidence: row.confidence as WorkRunConfidence,
    rationale: (row.rationale as string | null) ?? null,
    blockingQuestion: (row.blocking_question as string | null) ?? null,
    draftTitle: (row.draft_title as string | null) ?? null,
    draft: (row.draft as string | null) ?? null,
    sources: Array.isArray(row.sources) ? (row.sources as WorkSource[]) : [],
    notificationTier: row.notification_tier as NotificationTier,
    notificationReason: (row.notification_reason as string | null) ?? null,
    notificationSentAt: (row.notification_sent_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

