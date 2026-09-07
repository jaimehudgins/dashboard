import { Area, Project, Task } from "@/types";
import { WorkBrief, WorkSource } from "@/lib/workbench";

export interface WorkbenchRevisionOptions {
  feedback?: string;
  researchAgain?: boolean;
  rememberPreference?: boolean;
  sourceFeedback?: Record<string, NonNullable<WorkSource["feedback"]>>;
  manualOverride?: boolean;
}

export interface WorkbenchTaskContext extends WorkbenchRevisionOptions {
  task: Task;
  project?: Project;
  area?: Area;
  force?: boolean;
}

function serializeTask(task: Task) {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString(),
    focusDate: task.focusDate?.toISOString(),
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString(),
    recurrenceEndDate: task.recurrenceEndDate?.toISOString(),
  };
}

export async function prepareTaskWithLeo(input: WorkbenchTaskContext) {
  const response = await fetch("/api/workbench/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: serializeTask(input.task),
      project: input.project,
      area: input.area,
      force: input.force ?? false,
      feedback: input.feedback,
      research_again: input.researchAgain ?? false,
      remember_preference: input.rememberPreference ?? false,
      source_feedback: input.sourceFeedback,
      manual_override: input.manualOverride ?? false,
    }),
  });
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`Leo returned an invalid response (${response.status})`);
    }
  }
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Leo could not prepare this task",
    );
  }
  return data;
}

export async function previewTaskWorkBrief(input: WorkbenchTaskContext) {
  const response = await fetch("/api/workbench/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: serializeTask(input.task),
      project: input.project,
      area: input.area,
      manual_override: input.manualOverride ?? false,
      preview_only: true,
    }),
  });
  const raw = await response.text();
  let data: { brief?: WorkBrief; error?: string } = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as { brief?: WorkBrief; error?: string };
    } catch {
      throw new Error(`Leo returned an invalid response (${response.status})`);
    }
  }
  if (!response.ok || !data.brief) {
    throw new Error(data.error || "Leo could not prepare a work brief");
  }
  return data.brief;
}
