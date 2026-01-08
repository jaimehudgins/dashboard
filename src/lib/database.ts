import { supabase } from "./supabase";
import {
  Task,
  Project,
  InboxItem,
  FocusSession,
  Tag,
  TaskDependency,
  TaskTemplate,
  Milestone,
  Comment,
  ActivityLog,
  Attachment,
  ProjectNote,
  MiscCategory,
  EnergyLog,
} from "@/types";

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
    parentTaskId: row.parent_task_id as string | undefined,
    recurrenceRule: row.recurrence_rule as Task["recurrenceRule"],
    recurrenceEndDate: row.recurrence_end_date
      ? new Date(row.recurrence_end_date as string)
      : undefined,
    recurringParentId: row.recurring_parent_id as string | undefined,
    milestoneId: row.milestone_id as string | undefined,
    categoryId: row.category_id as string | undefined,
    link: row.link as string | undefined,
  };
}

function toMiscCategory(row: Record<string, unknown>): MiscCategory {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    displayOrder: row.display_order as number | undefined,
    isCollapsed: row.is_collapsed as boolean | undefined,
    createdAt: new Date(row.created_at as string),
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

function toTaskDependency(row: Record<string, unknown>): TaskDependency {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    dependsOnTaskId: row.depends_on_task_id as string,
    createdAt: new Date(row.created_at as string),
  };
}

function toTaskTemplate(row: Record<string, unknown>): TaskTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    defaultPriority: row.default_priority as TaskTemplate["defaultPriority"],
    subtasks: (row.subtasks as TaskTemplate["subtasks"]) || [],
    createdAt: new Date(row.created_at as string),
  };
}

function toMilestone(row: Record<string, unknown>): Milestone {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    dueDate: row.due_date ? new Date(row.due_date as string) : undefined,
    status: row.status as Milestone["status"],
    displayOrder: row.display_order as number | undefined,
    createdAt: new Date(row.created_at as string),
    link: row.link as string | undefined,
  };
}

function toComment(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    content: row.content as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function toActivityLog(row: Record<string, unknown>): ActivityLog {
  return {
    id: row.id as string,
    projectId: row.project_id as string | undefined,
    taskId: row.task_id as string | undefined,
    action: row.action as string,
    details: row.details as Record<string, unknown> | undefined,
    createdAt: new Date(row.created_at as string),
  };
}

function toAttachment(row: Record<string, unknown>): Attachment {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    fileName: row.file_name as string,
    fileUrl: row.file_url as string,
    fileSize: row.file_size as number | undefined,
    fileType: row.file_type as string | undefined,
    createdAt: new Date(row.created_at as string),
  };
}

function toProjectNote(row: Record<string, unknown>): ProjectNote {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    title: row.title as string,
    content: row.content as string,
    displayOrder: row.display_order as number | undefined,
    isPinned: row.is_pinned as boolean,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
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
    parent_task_id: task.parentTaskId,
    recurrence_rule: task.recurrenceRule,
    recurrence_end_date: task.recurrenceEndDate?.toISOString(),
    recurring_parent_id: task.recurringParentId,
    milestone_id: task.milestoneId,
    link: task.link,
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
      parent_task_id: task.parentTaskId,
      recurrence_rule: task.recurrenceRule,
      recurrence_end_date: task.recurrenceEndDate?.toISOString(),
      recurring_parent_id: task.recurringParentId,
      milestone_id: task.milestoneId,
      link: task.link,
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

// Task Dependencies
export async function fetchTaskDependencies(): Promise<TaskDependency[]> {
  const { data, error } = await supabase
    .from("task_dependencies")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(toTaskDependency);
}

export async function createTaskDependency(
  dependency: TaskDependency,
): Promise<void> {
  const { error } = await supabase.from("task_dependencies").insert({
    id: dependency.id,
    task_id: dependency.taskId,
    depends_on_task_id: dependency.dependsOnTaskId,
    created_at: dependency.createdAt.toISOString(),
  });

  if (error) throw error;
}

export async function deleteTaskDependency(
  dependencyId: string,
): Promise<void> {
  const { error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("id", dependencyId);

  if (error) throw error;
}

// Task Templates
export async function fetchTaskTemplates(): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from("task_templates")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(toTaskTemplate);
}

export async function createTaskTemplate(
  template: TaskTemplate,
): Promise<void> {
  const { error } = await supabase.from("task_templates").insert({
    id: template.id,
    name: template.name,
    description: template.description,
    default_priority: template.defaultPriority,
    subtasks: template.subtasks,
    created_at: template.createdAt.toISOString(),
  });

  if (error) throw error;
}

export async function updateTaskTemplate(
  template: TaskTemplate,
): Promise<void> {
  const { error } = await supabase
    .from("task_templates")
    .update({
      name: template.name,
      description: template.description,
      default_priority: template.defaultPriority,
      subtasks: template.subtasks,
    })
    .eq("id", template.id);

  if (error) throw error;
}

export async function deleteTaskTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from("task_templates")
    .delete()
    .eq("id", templateId);

  if (error) throw error;
}

// Milestones
export async function fetchMilestones(): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from("milestones")
    .select("*")
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(toMilestone);
}

export async function createMilestone(milestone: Milestone): Promise<void> {
  const insertData = {
    id: milestone.id,
    project_id: milestone.projectId,
    name: milestone.name,
    description: milestone.description,
    due_date: milestone.dueDate?.toISOString(),
    status: milestone.status,
    display_order: milestone.displayOrder,
    created_at: milestone.createdAt.toISOString(),
    link: milestone.link,
  };

  const { error } = await supabase.from("milestones").insert(insertData);

  if (error) {
    throw error;
  }
}

export async function updateMilestone(milestone: Milestone): Promise<void> {
  const { error } = await supabase
    .from("milestones")
    .update({
      name: milestone.name,
      description: milestone.description,
      due_date: milestone.dueDate?.toISOString(),
      status: milestone.status,
      display_order: milestone.displayOrder,
      link: milestone.link,
    })
    .eq("id", milestone.id);

  if (error) throw error;
}

export async function deleteMilestone(milestoneId: string): Promise<void> {
  const { error } = await supabase
    .from("milestones")
    .delete()
    .eq("id", milestoneId);

  if (error) throw error;
}

// Comments
export async function fetchComments(): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(toComment);
}

export async function createComment(comment: Comment): Promise<void> {
  const { error } = await supabase.from("comments").insert({
    id: comment.id,
    task_id: comment.taskId,
    content: comment.content,
    created_at: comment.createdAt.toISOString(),
    updated_at: comment.updatedAt.toISOString(),
  });

  if (error) throw error;
}

export async function updateComment(comment: Comment): Promise<void> {
  const { error } = await supabase
    .from("comments")
    .update({
      content: comment.content,
      updated_at: new Date().toISOString(),
    })
    .eq("id", comment.id);

  if (error) throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId);

  if (error) throw error;
}

// Activity Logs
export async function fetchActivityLogs(): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data || []).map(toActivityLog);
}

export async function createActivityLog(log: ActivityLog): Promise<void> {
  const { error } = await supabase.from("activity_logs").insert({
    id: log.id,
    project_id: log.projectId,
    task_id: log.taskId,
    action: log.action,
    details: log.details,
    created_at: log.createdAt.toISOString(),
  });

  if (error) throw error;
}

// Attachments
export async function fetchAttachments(): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(toAttachment);
}

export async function createAttachment(attachment: Attachment): Promise<void> {
  const { error } = await supabase.from("attachments").insert({
    id: attachment.id,
    task_id: attachment.taskId,
    file_name: attachment.fileName,
    file_url: attachment.fileUrl,
    file_size: attachment.fileSize,
    file_type: attachment.fileType,
    created_at: attachment.createdAt.toISOString(),
  });

  if (error) throw error;
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const { error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", attachmentId);

  if (error) throw error;
}

// Project Notes
export async function fetchProjectNotes(): Promise<ProjectNote[]> {
  const { data, error } = await supabase
    .from("project_notes")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(toProjectNote);
}

export async function createProjectNote(note: ProjectNote): Promise<void> {
  const { error } = await supabase.from("project_notes").insert({
    id: note.id,
    project_id: note.projectId,
    title: note.title,
    content: note.content,
    display_order: note.displayOrder,
    is_pinned: note.isPinned,
    created_at: note.createdAt.toISOString(),
    updated_at: note.updatedAt.toISOString(),
  });

  if (error) throw error;
}

export async function updateProjectNote(note: ProjectNote): Promise<void> {
  const { error } = await supabase
    .from("project_notes")
    .update({
      title: note.title,
      content: note.content,
      display_order: note.displayOrder,
      is_pinned: note.isPinned,
      updated_at: new Date().toISOString(),
    })
    .eq("id", note.id);

  if (error) throw error;
}

export async function deleteProjectNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from("project_notes")
    .delete()
    .eq("id", noteId);

  if (error) throw error;
}

// Batch update note orders
export async function updateNoteOrders(
  updates: { id: string; displayOrder: number }[],
): Promise<void> {
  await Promise.all(
    updates.map(({ id, displayOrder }) =>
      supabase
        .from("project_notes")
        .update({ display_order: displayOrder })
        .eq("id", id),
    ),
  );
}

// Misc Categories
export async function fetchMiscCategories(): Promise<MiscCategory[]> {
  const { data, error } = await supabase
    .from("misc_categories")
    .select("*")
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(toMiscCategory);
}

export async function createMiscCategory(
  category: MiscCategory,
): Promise<void> {
  const { error } = await supabase.from("misc_categories").insert({
    id: category.id,
    name: category.name,
    color: category.color,
    display_order: category.displayOrder,
    is_collapsed: category.isCollapsed,
    created_at: category.createdAt.toISOString(),
  });

  if (error) throw error;
}

export async function updateMiscCategory(
  category: MiscCategory,
): Promise<void> {
  const { error } = await supabase
    .from("misc_categories")
    .update({
      name: category.name,
      color: category.color,
      display_order: category.displayOrder,
      is_collapsed: category.isCollapsed,
    })
    .eq("id", category.id);

  if (error) throw error;
}

export async function deleteMiscCategory(categoryId: string): Promise<void> {
  const { error } = await supabase
    .from("misc_categories")
    .delete()
    .eq("id", categoryId);

  if (error) throw error;
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

// Energy Logs
function toEnergyLog(row: Record<string, unknown>): EnergyLog {
  return {
    id: row.id as string,
    date: new Date(row.date as string),
    timeSlot: row.time_slot as EnergyLog["timeSlot"],
    level: row.level as number,
    note: row.note as string | undefined,
    createdAt: new Date(row.created_at as string),
  };
}

export async function fetchEnergyLogs(): Promise<EnergyLog[]> {
  const { data, error } = await supabase
    .from("energy_logs")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100); // Get last ~25 days worth

  // Return empty array if table doesn't exist yet
  if (error) {
    console.warn("energy_logs table not found or error:", error.message);
    return [];
  }
  return (data || []).map(toEnergyLog);
}

export async function createEnergyLog(log: EnergyLog): Promise<void> {
  const { error } = await supabase.from("energy_logs").insert({
    id: log.id,
    date: log.date.toISOString().split("T")[0], // Just the date part
    time_slot: log.timeSlot,
    level: log.level,
    note: log.note,
    created_at: log.createdAt.toISOString(),
  });

  if (error) throw error;
}

export async function updateEnergyLog(log: EnergyLog): Promise<void> {
  const { error } = await supabase
    .from("energy_logs")
    .update({
      level: log.level,
      note: log.note,
    })
    .eq("id", log.id);

  if (error) throw error;
}

export async function deleteEnergyLog(logId: string): Promise<void> {
  const { error } = await supabase.from("energy_logs").delete().eq("id", logId);

  if (error) throw error;
}

// Load all data
export async function loadAllData(): Promise<{
  projects: Project[];
  tasks: Task[];
  inbox: InboxItem[];
  focusSessions: FocusSession[];
  tags: Tag[];
  taskDependencies: TaskDependency[];
  taskTemplates: TaskTemplate[];
  milestones: Milestone[];
  comments: Comment[];
  activityLogs: ActivityLog[];
  attachments: Attachment[];
  projectNotes: ProjectNote[];
  miscCategories: MiscCategory[];
  energyLogs: EnergyLog[];
}> {
  const [
    projects,
    tasks,
    inbox,
    focusSessions,
    tags,
    taskDependencies,
    taskTemplates,
    milestones,
    comments,
    activityLogs,
    attachments,
    projectNotes,
    miscCategories,
    energyLogs,
  ] = await Promise.all([
    fetchProjects(),
    fetchTasks(),
    fetchInboxItems(),
    fetchFocusSessions(),
    fetchTags(),
    fetchTaskDependencies(),
    fetchTaskTemplates(),
    fetchMilestones(),
    fetchComments(),
    fetchActivityLogs(),
    fetchAttachments(),
    fetchProjectNotes(),
    fetchMiscCategories(),
    fetchEnergyLogs(),
  ]);

  return {
    projects,
    tasks,
    inbox,
    focusSessions,
    tags,
    taskDependencies,
    taskTemplates,
    milestones,
    comments,
    activityLogs,
    attachments,
    projectNotes,
    miscCategories,
    energyLogs,
  };
}
