export type Priority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";
export type RecurrenceRule = "daily" | "weekly" | "monthly" | null;
export type MilestoneStatus = "active" | "completed";

export interface Reminder {
  id: string;
  minutesBefore: number;
  notified: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  status: TaskStatus;
  projectId: string;
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;
  focusMinutes: number;
  displayOrder?: number;
  tagIds?: string[];
  reminders?: Reminder[];
  // Subtasks
  parentTaskId?: string;
  // Recurring
  recurrenceRule?: RecurrenceRule;
  recurrenceEndDate?: Date;
  recurringParentId?: string;
  // Milestones
  milestoneId?: string;
  // Misc category (for tasks with projectId = "misc")
  categoryId?: string;
}

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: Date;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  defaultPriority: Priority;
  subtasks: { title: string; priority: Priority }[];
  createdAt: Date;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  dueDate?: Date;
  status: MilestoneStatus;
  displayOrder?: number;
  createdAt: Date;
}

export interface Comment {
  id: string;
  taskId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityLog {
  id: string;
  projectId?: string;
  taskId?: string;
  action: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

export interface Attachment {
  id: string;
  taskId: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  fileType?: string;
  createdAt: Date;
}

export interface ProjectNote {
  id: string;
  projectId: string;
  title: string;
  content: string;
  displayOrder?: number;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  scratchpad: string;
  totalFocusMinutes: number;
  createdAt: Date;
  displayOrder?: number;
  archived?: boolean;
}

export interface InboxItem {
  id: string;
  content: string;
  createdAt: Date;
}

export interface FocusSession {
  id: string;
  taskId: string;
  projectId: string;
  startTime: Date;
  endTime?: Date;
  minutes: number;
  notes?: string;
}

export interface DailySummary {
  date: Date;
  completedTasks: Task[];
  totalFocusMinutes: number;
  projectBreakdown: { projectId: string; minutes: number }[];
  momentumScore: number;
}

export interface MiscCategory {
  id: string;
  name: string;
  color: string;
  displayOrder?: number;
  isCollapsed?: boolean;
  createdAt: Date;
}
