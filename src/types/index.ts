export type Priority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";

export interface Reminder {
  id: string;
  minutesBefore: number; // e.g., 60 = 1 hour before, 1440 = 1 day before
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
