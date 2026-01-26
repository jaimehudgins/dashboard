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
  projectId: string | null;
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;
  focusMinutes: number;
  displayOrder?: number;
  tagIds?: string[];
  reminders?: Reminder[];
  // Time estimate in minutes
  estimatedMinutes?: number;
  // Actual time spent in minutes
  actualMinutes?: number;
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
  // External link
  link?: string;
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
  link?: string;
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
  projectId?: string | null;
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

export interface ProjectLink {
  id: string;
  projectId: string;
  title: string;
  url: string;
  displayOrder?: number;
  createdAt: Date;
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
  projectId: string | null;
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

export type EnergyTimeSlot = "morning" | "midday" | "afternoon" | "evening";

export interface EnergyLog {
  id: string;
  date: Date;
  timeSlot: EnergyTimeSlot;
  level: number; // 1-5
  note?: string;
  createdAt: Date;
}

// Note Catcher types
export type StickyNoteColor = "yellow" | "pink" | "blue" | "green" | "purple";

export interface StickyNote {
  id: string;
  title: string;
  content: string;
  color: StickyNoteColor;
  displayOrder: number;
  positionX?: number;
  positionY?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuickTodoItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface QuickTodoList {
  id: string;
  title: string;
  items: QuickTodoItem[];
  displayOrder: number;
  positionX?: number;
  positionY?: number;
  createdAt: Date;
}
