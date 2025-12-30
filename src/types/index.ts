export type Priority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";

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
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  scratchpad: string;
  totalFocusMinutes: number;
  createdAt: Date;
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
