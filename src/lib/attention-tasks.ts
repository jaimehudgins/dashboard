import "server-only";
import { createHash } from "node:crypto";
import { responseDb } from "./partner-response-store";
import { emailTaskLink, normalizedTaskTitle, taskBelongsToThread, type EmailTaskSummary } from "./email-task";

const columns = "id, title, status, due_date, link, description";
export async function linkedEmailTasks(threadId: string): Promise<EmailTaskSummary[]> {
  const { data, error } = await responseDb().from("tasks").select(columns)
    .or(`link.ilike.%${threadId}%,description.ilike.%${threadId}%`).limit(101);
  if (error || (data?.length ?? 0) > 100) throw new Error("Could not safely check existing tasks. Try again before creating another task.");
  return (data ?? []).filter((task) => taskBelongsToThread(task, threadId));
}
export function emailTaskId(threadId: string, title: string): string {
  const hex = createHash("sha256").update(`attention-task:${threadId}:${normalizedTaskTitle(title)}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export async function createEmailTask(input: { threadId: string; messageId: string; title: string; notes: string; dueDate: string | null; links: string[] }) {
  const tasks = await linkedEmailTasks(input.threadId);
  const duplicate = tasks.find((task) => normalizedTaskTitle(task.title) === normalizedTaskTitle(input.title));
  if (duplicate) return { task: duplicate, existing: true };
  const db = responseDb();
  const areas = await db.from("areas").select("id, name");
  if (areas.error) throw new Error("Could not load Work areas. No task was created.");
  const area = areas.data?.find((row) => row.name.toLowerCase() === "partner success")
    ?? areas.data?.find((row) => row.name.toLowerCase() === "partner");
  const id = emailTaskId(input.threadId, input.title);
  const { data, error } = await db.from("tasks").insert({
    id, title: input.title, description: `${input.notes}\n\nSource email: ${emailTaskLink(input.threadId)}\nSource message: ${input.messageId}${input.links.length ? `\n\nRelated links (selected by Jaime):\n${input.links.join("\n")}` : ""}`,
    link: emailTaskLink(input.threadId), priority: "medium", status: "pending", project_id: null,
    area_id: area?.id ?? null, due_date: input.dueDate ? `${input.dueDate}T18:00:00Z` : null,
    focus_minutes: 0, created_at: new Date().toISOString(),
  }).select(columns).single();
  // Deterministic IDs prevent duplicate writes after a double click, race, or lost response.
  if (error?.code === "23505") {
    const existing = await db.from("tasks").select(columns).eq("id", id).single();
    if (existing.error || !existing.data) throw new Error("Could not confirm the existing task. Refresh before retrying.");
    return { task: existing.data as EmailTaskSummary, existing: true };
  }
  if (error || !data) throw new Error("Could not confirm task creation. Refresh linked tasks before retrying.");
  return { task: data as EmailTaskSummary, existing: false };
}
