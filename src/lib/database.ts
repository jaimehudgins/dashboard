import { supabase } from "./supabase";
import { Task, Project, InboxItem, FocusSession, Tag } from "@/types";

// Helper to convert snake_case DB rows to camelCase
function toTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | undefined,
    priority: row.priority as Task["priority"],
    status: row.status as Task["status"],
    projectId: row.project_id as string,
    dueDate: row.due_date ? new Date(row.due_date as string) : undefined,
    createdAt: new Date(row.created_at as string),
    completedAt: row.completed_at
      ? new Date(row.completed_at as string)
      : undefined,
    focusMinutes: row.focus_minutes as number,
    displayOrder: row.display_order as number | undefined,
    tagIds: (row.tag_ids as string[]) || [],
    reminders: (row.reminders as Task["reminders"]) || [],
  };
}

function toProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    color: row.color as string,
    scratchpad: row.scratchpad as string,
    totalFocusMinutes: row.total_focus_minutes as number,
    createdAt: new Date(row.created_at as string),
    displayOrder: row.display_order as number | undefined,
    archived: row.archived as boolean | undefined,
  };
}

function toInboxItem(row: Record<string, unknown>): InboxItem {
  return {
    id: row.id as string,
    content: row.content as string,
    createdAt: new Date(row.created_at as string),
  };
}

function toFocusSession(row: Record<string, unknown>): FocusSession {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    projectId: row.project_id as string,
    startTime: new Date(row.start_time as string),
    endTime: row.end_time ? new Date(row.end_time as string) : undefined,
    minutes: row.minutes as number,
    notes: row.notes as string | undefined,
  };
}

function toTag(row: Record<string, unknown>): Tag {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    createdAt: new Date(row.created_at as string),
  };
}

// Projects
export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(toProject);
}

export async function createProject(project: Project): Promise<void> {
  const { error } = await supabase.from("projects").insert({
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    scratchpad: project.scratchpad,
    total_focus_minutes: project.totalFocusMinutes,
    created_at: project.createdAt.toISOString(),
    display_order: project.displayOrder,
    archived: project.archived || false,
  });

  if (error) throw error;
}

export async function updateProject(project: Project): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({
      name: project.name,
      description: project.description,
      color: project.color,
      scratchpad: project.scratchpad,
      total_focus_minutes: project.totalFocusMinutes,
      display_order: project.displayOrder,
      archived: project.archived,
    })
    .eq("id", project.id);

  if (error) throw error;
}

// Tasks
export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(toTask);
}

export async function createTask(task: Task): Promise<void> {
  const { error } = await supabase.from("tasks").insert({
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    project_id: task.projectId,
    due_date: task.dueDate?.toISOString(),
    created_at: task.createdAt.toISOString(),
    completed_at: task.completedAt?.toISOString(),
    focus_minutes: task.focusMinutes,
    display_order: task.displayOrder,
    tag_ids: task.tagIds || [],
    reminders: task.reminders || [],
  });

  if (error) throw error;
}

export async function updateTask(task: Task): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      project_id: task.projectId,
      due_date: task.dueDate?.toISOString(),
      completed_at: task.completedAt?.toISOString(),
      focus_minutes: task.focusMinutes,
      display_order: task.displayOrder,
      tag_ids: task.tagIds || [],
      reminders: task.reminders || [],
    })
    .eq("id", task.id);

  if (error) throw error;
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) throw error;
}

// Batch update task orders
export async function updateTaskOrders(
  updates: { id: string; displayOrder: number }[],
): Promise<void> {
  // Supabase doesn't support batch updates easily, so we do them in parallel
  await Promise.all(
    updates.map(({ id, displayOrder }) =>
      supabase
        .from("tasks")
        .update({ display_order: displayOrder })
        .eq("id", id),
    ),
  );
}

// Batch update project orders
export async function updateProjectOrders(
  updates: { id: string; displayOrder: number }[],
): Promise<void> {
  await Promise.all(
    updates.map(({ id, displayOrder }) =>
      supabase
        .from("projects")
        .update({ display_order: displayOrder })
        .eq("id", id),
    ),
  );
}

// Inbox Items
export async function fetchInboxItems(): Promise<InboxItem[]> {
  const { data, error } = await supabase
    .from("inbox_items")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(toInboxItem);
}

export async function createInboxItem(item: InboxItem): Promise<void> {
  const { error } = await supabase.from("inbox_items").insert({
    id: item.id,
    content: item.content,
    created_at: item.createdAt.toISOString(),
  });

  if (error) throw error;
}

export async function deleteInboxItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from("inbox_items")
    .delete()
    .eq("id", itemId);

  if (error) throw error;
}

// Focus Sessions
export async function fetchFocusSessions(): Promise<FocusSession[]> {
  const { data, error } = await supabase
    .from("focus_sessions")
    .select("*")
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data || []).map(toFocusSession);
}

export async function createFocusSession(session: FocusSession): Promise<void> {
  const { error } = await supabase.from("focus_sessions").insert({
    id: session.id,
    task_id: session.taskId,
    project_id: session.projectId,
    start_time: session.startTime.toISOString(),
    end_time: session.endTime?.toISOString(),
    minutes: session.minutes,
    notes: session.notes,
  });

  if (error) throw error;
}

export async function updateFocusSession(session: FocusSession): Promise<void> {
  const { error } = await supabase
    .from("focus_sessions")
    .update({
      end_time: session.endTime?.toISOString(),
      minutes: session.minutes,
      notes: session.notes,
    })
    .eq("id", session.id);

  if (error) throw error;
}

// Tags
export async function fetchTags(): Promise<Tag[]> {
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(toTag);
}

export async function createTag(tag: Tag): Promise<void> {
  const { error } = await supabase.from("tags").insert({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    created_at: tag.createdAt.toISOString(),
  });

  if (error) throw error;
}

export async function updateTag(tag: Tag): Promise<void> {
  const { error } = await supabase
    .from("tags")
    .update({
      name: tag.name,
      color: tag.color,
    })
    .eq("id", tag.id);

  if (error) throw error;
}

export async function deleteTag(tagId: string): Promise<void> {
  const { error } = await supabase.from("tags").delete().eq("id", tagId);

  if (error) throw error;
}

// Load all data
export async function loadAllData(): Promise<{
  projects: Project[];
  tasks: Task[];
  inbox: InboxItem[];
  focusSessions: FocusSession[];
  tags: Tag[];
}> {
  const [projects, tasks, inbox, focusSessions, tags] = await Promise.all([
    fetchProjects(),
    fetchTasks(),
    fetchInboxItems(),
    fetchFocusSessions(),
    fetchTags(),
  ]);

  return { projects, tasks, inbox, focusSessions, tags };
}
