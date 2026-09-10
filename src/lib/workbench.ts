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

export type WorkRoute = "leo_starts" | "leo_prepares" | "jaime_action";

export type WorkResearchSource =
  | "drive"
  | "curriculum_repo"
  | "gmail"
  | "granola"
  | "crm"
  | "platform"
  | "slack";

export interface WorkBrief {
  route: WorkRoute;
  confidence: WorkRunConfidence;
  rationale: string;
  intendedDeliverable: string;
  audience: string;
  outcome: string;
  constraints: string[];
  requiredSources: WorkResearchSource[];
  searchTerms: string[];
}

export type WorkQualityStatus = "pass" | "needs_work";

export interface WorkQualityDimension {
  status: WorkQualityStatus;
  note: string;
}

export interface WorkQualityReview {
  overallPass: boolean;
  initialPass: boolean;
  revised: boolean;
  summary: string;
  remainingGap: string;
  checkedAt: string;
  dimensions: {
    grounding: WorkQualityDimension;
    completeness: WorkQualityDimension;
    usefulness: WorkQualityDimension;
    sourceCoverage: WorkQualityDimension;
    briefAlignment: WorkQualityDimension;
  };
}

export interface WorkSource {
  type:
    | "task"
    | "project"
    | "drive"
    | "curriculum_repo"
    | "memory"
    | "gmail"
    | "granola"
    | "slack"
    | "crm"
    | "platform"
    | "brief"
    | "quality"
    | "feedback";
  title: string;
  url?: string;
  excerpt?: string;
  modifiedAt?: string;
  checkedAt?: string;
  status?: "used" | "no_match" | "unavailable" | "error";
  feedback?: "useful" | "irrelevant";
  brief?: WorkBrief;
  qualityReview?: WorkQualityReview;
}

export function workBriefSource(brief: WorkBrief): WorkSource {
  return {
    type: "brief",
    title: "Leo work brief",
    excerpt: [
      `Route: ${brief.route.replace("_", " ")}`,
      `Confidence: ${brief.confidence}`,
      `Reason: ${brief.rationale}`,
      `Deliverable: ${brief.intendedDeliverable || "Not yet clear"}`,
      `Audience: ${brief.audience || "Not specified"}`,
      `Outcome: ${brief.outcome || "Not specified"}`,
      brief.constraints.length
        ? `Constraints: ${brief.constraints.join("; ")}`
        : "",
      brief.requiredSources.length
        ? `Required sources: ${brief.requiredSources.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    status: "used",
    brief,
  };
}

export function workQualitySource(review: WorkQualityReview): WorkSource {
  const dimensionLines = Object.entries(review.dimensions).map(
    ([name, dimension]) =>
      `${name}: ${dimension.status.replace("_", " ")} — ${dimension.note}`,
  );
  return {
    type: "quality",
    title: "Leo quality review",
    excerpt: [
      `Overall: ${review.overallPass ? "pass" : "needs work"}`,
      `Automatic revision: ${review.revised ? "yes" : "no"}`,
      `Summary: ${review.summary}`,
      ...dimensionLines,
      review.remainingGap ? `Remaining gap: ${review.remainingGap}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    status: "used",
    checkedAt: review.checkedAt,
    qualityReview: review,
  };
}

export function workSourceKey(source: Pick<WorkSource, "type" | "title">) {
  return `${source.type}:${source.title}`;
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

// Hide completed tasks from active work surfaces without deleting their runs.
// Reopening a task restores its saved work automatically.
export function openTaskWorkRuns(runs: WorkRun[], completedTaskIds: string[]): WorkRun[] {
  const completed = new Set(completedTaskIds);
  return runs.filter((run) => !completed.has(run.taskId));
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
