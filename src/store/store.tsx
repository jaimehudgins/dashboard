"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { addDays, addWeeks, addMonths } from "date-fns";
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
} from "@/types";
import * as db from "@/lib/database";

interface AppState {
  projects: Project[];
  tasks: Task[];
  inbox: InboxItem[];
  focusSessions: FocusSession[];
  activeFocusSession: FocusSession | null;
  completedToday: Task[];
  tags: Tag[];
  taskDependencies: TaskDependency[];
  taskTemplates: TaskTemplate[];
  milestones: Milestone[];
  comments: Comment[];
  activityLogs: ActivityLog[];
  attachments: Attachment[];
  projectNotes: ProjectNote[];
  miscCategories: MiscCategory[];
  isLoading: boolean;
  error: string | null;
}

type Action =
  | { type: "ADD_PROJECT"; payload: Project }
  | { type: "UPDATE_PROJECT"; payload: Project }
  | { type: "ADD_TASK"; payload: Task }
  | { type: "UPDATE_TASK"; payload: Task }
  | { type: "DELETE_TASK"; payload: string }
  | {
      type: "REORDER_TASKS";
      payload: { projectId?: string; taskIds: string[] };
    }
  | { type: "REORDER_PROJECTS"; payload: string[] }
  | { type: "ADD_INBOX_ITEM"; payload: InboxItem }
  | { type: "REMOVE_INBOX_ITEM"; payload: string }
  | { type: "START_FOCUS"; payload: FocusSession }
  | { type: "END_FOCUS"; payload: { minutes: number; notes?: string } }
  | {
      type: "UPDATE_SCRATCHPAD";
      payload: { projectId: string; content: string };
    }
  | { type: "ADD_TAG"; payload: Tag }
  | { type: "UPDATE_TAG"; payload: Tag }
  | { type: "DELETE_TAG"; payload: string }
  | {
      type: "MARK_REMINDER_NOTIFIED";
      payload: { taskId: string; reminderId: string };
    }
  // Task Dependencies
  | { type: "ADD_DEPENDENCY"; payload: TaskDependency }
  | { type: "DELETE_DEPENDENCY"; payload: string }
  // Task Templates
  | { type: "ADD_TEMPLATE"; payload: TaskTemplate }
  | { type: "UPDATE_TEMPLATE"; payload: TaskTemplate }
  | { type: "DELETE_TEMPLATE"; payload: string }
  // Milestones
  | { type: "ADD_MILESTONE"; payload: Milestone }
  | { type: "UPDATE_MILESTONE"; payload: Milestone }
  | { type: "DELETE_MILESTONE"; payload: string }
  // Comments
  | { type: "ADD_COMMENT"; payload: Comment }
  | { type: "UPDATE_COMMENT"; payload: Comment }
  | { type: "DELETE_COMMENT"; payload: string }
  // Activity Logs
  | { type: "LOG_ACTIVITY"; payload: ActivityLog }
  // Attachments
  | { type: "ADD_ATTACHMENT"; payload: Attachment }
  | { type: "DELETE_ATTACHMENT"; payload: string }
  // Project Notes
  | { type: "ADD_NOTE"; payload: ProjectNote }
  | { type: "UPDATE_NOTE"; payload: ProjectNote }
  | { type: "DELETE_NOTE"; payload: string }
  | { type: "REORDER_NOTES"; payload: string[] }
  // Misc Categories
  | { type: "ADD_CATEGORY"; payload: MiscCategory }
  | { type: "UPDATE_CATEGORY"; payload: MiscCategory }
  | { type: "DELETE_CATEGORY"; payload: string }
  // System
  | { type: "LOAD_STATE"; payload: Partial<AppState> }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null };

const emptyState: AppState = {
  projects: [],
  tasks: [],
  inbox: [],
  focusSessions: [],
  activeFocusSession: null,
  completedToday: [],
  tags: [],
  taskDependencies: [],
  taskTemplates: [],
  milestones: [],
  comments: [],
  activityLogs: [],
  attachments: [],
  projectNotes: [],
  miscCategories: [],
  isLoading: true,
  error: null,
};

function recalculateCompletedToday(tasks: Task[]): Task[] {
  const today = new Date().toDateString();
  return tasks.filter(
    (t) => t.completedAt && new Date(t.completedAt).toDateString() === today,
  );
}

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "ADD_PROJECT":
      return { ...state, projects: [...state.projects, action.payload] };

    case "UPDATE_PROJECT":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.id ? action.payload : p,
        ),
      };

    case "ADD_TASK": {
      const newTask = action.payload;
      const activityLog: ActivityLog = {
        id: `activity-${Date.now()}`,
        projectId: newTask.projectId,
        taskId: newTask.id,
        action: "task_created",
        details: { taskTitle: newTask.title },
        createdAt: new Date(),
      };
      return {
        ...state,
        tasks: [...state.tasks, newTask],
        activityLogs: [...state.activityLogs, activityLog],
      };
    }

    case "UPDATE_TASK": {
      const updatedTask = action.payload;
      const originalTask = state.tasks.find((t) => t.id === updatedTask.id);
      const wasNotCompleted = originalTask?.status !== "completed";
      const isNowCompleted = updatedTask.status === "completed";

      let newCompletedToday = state.completedToday;
      let newTasks = state.tasks.map((t) =>
        t.id === updatedTask.id ? updatedTask : t,
      );

      if (wasNotCompleted && isNowCompleted) {
        updatedTask.completedAt = new Date();
        newCompletedToday = [...state.completedToday, updatedTask];

        // Handle recurring task - create next instance
        if (updatedTask.recurrenceRule && originalTask) {
          const baseDate = updatedTask.dueDate
            ? new Date(updatedTask.dueDate)
            : new Date();
          let nextDueDate: Date;

          switch (updatedTask.recurrenceRule) {
            case "daily":
              nextDueDate = addDays(baseDate, 1);
              break;
            case "weekly":
              nextDueDate = addWeeks(baseDate, 1);
              break;
            case "monthly":
              nextDueDate = addMonths(baseDate, 1);
              break;
            default:
              nextDueDate = baseDate;
          }

          // Check if we should create the next instance (not past end date)
          const shouldCreate =
            !updatedTask.recurrenceEndDate ||
            nextDueDate <= new Date(updatedTask.recurrenceEndDate);

          if (shouldCreate) {
            const newRecurringTask: Task = {
              id: `task-${Date.now()}`,
              title: updatedTask.title,
              description: updatedTask.description,
              priority: updatedTask.priority,
              status: "pending",
              projectId: updatedTask.projectId,
              dueDate: nextDueDate,
              createdAt: new Date(),
              focusMinutes: 0,
              displayOrder: (originalTask.displayOrder ?? 0) + 1,
              tagIds: updatedTask.tagIds,
              recurrenceRule: updatedTask.recurrenceRule,
              recurrenceEndDate: updatedTask.recurrenceEndDate,
              recurringParentId:
                updatedTask.recurringParentId || updatedTask.id,
            };
            newTasks = [...newTasks, newRecurringTask];
          }
        }
      }

      // Create activity log for task updates
      let newActivityLogs = state.activityLogs;
      if (wasNotCompleted && isNowCompleted) {
        const activityLog: ActivityLog = {
          id: `activity-${Date.now()}`,
          projectId: updatedTask.projectId,
          taskId: updatedTask.id,
          action: "task_completed",
          details: { taskTitle: updatedTask.title },
          createdAt: new Date(),
        };
        newActivityLogs = [...newActivityLogs, activityLog];
      }

      return {
        ...state,
        tasks: newTasks,
        completedToday: newCompletedToday,
        activityLogs: newActivityLogs,
      };
    }

    case "DELETE_TASK": {
      const taskToDelete = state.tasks.find((t) => t.id === action.payload);
      const activityLog: ActivityLog = {
        id: `activity-${Date.now()}`,
        projectId: taskToDelete?.projectId,
        taskId: action.payload,
        action: "task_deleted",
        details: { taskTitle: taskToDelete?.title || "Unknown" },
        createdAt: new Date(),
      };
      return {
        ...state,
        tasks: state.tasks.filter(
          (t) => t.id !== action.payload && t.parentTaskId !== action.payload,
        ),
        activityLogs: [...state.activityLogs, activityLog],
      };
    }

    case "REORDER_TASKS": {
      const { taskIds } = action.payload;
      const updatedTasks = state.tasks.map((task) => {
        const newOrder = taskIds.indexOf(task.id);
        if (newOrder !== -1) {
          return { ...task, displayOrder: newOrder };
        }
        return task;
      });
      return { ...state, tasks: updatedTasks };
    }

    case "REORDER_PROJECTS": {
      const projectIds = action.payload;
      const updatedProjects = state.projects.map((project) => {
        const newOrder = projectIds.indexOf(project.id);
        if (newOrder !== -1) {
          return { ...project, displayOrder: newOrder };
        }
        return project;
      });
      return { ...state, projects: updatedProjects };
    }

    case "ADD_INBOX_ITEM":
      return { ...state, inbox: [...state.inbox, action.payload] };

    case "REMOVE_INBOX_ITEM":
      return {
        ...state,
        inbox: state.inbox.filter((i) => i.id !== action.payload),
      };

    case "START_FOCUS":
      return {
        ...state,
        activeFocusSession: action.payload,
      };

    case "END_FOCUS": {
      if (!state.activeFocusSession) return state;

      const session = {
        ...state.activeFocusSession,
        endTime: new Date(),
        minutes: action.payload.minutes,
        notes: action.payload.notes,
      };

      const updatedProjects = state.projects.map((p) =>
        p.id === session.projectId
          ? {
              ...p,
              totalFocusMinutes: p.totalFocusMinutes + action.payload.minutes,
            }
          : p,
      );

      const updatedTasks = state.tasks.map((t) =>
        t.id === session.taskId
          ? { ...t, focusMinutes: t.focusMinutes + action.payload.minutes }
          : t,
      );

      return {
        ...state,
        activeFocusSession: null,
        focusSessions: [...state.focusSessions, session],
        projects: updatedProjects,
        tasks: updatedTasks,
      };
    }

    case "UPDATE_SCRATCHPAD":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.projectId
            ? { ...p, scratchpad: action.payload.content }
            : p,
        ),
      };

    case "ADD_TAG":
      return { ...state, tags: [...state.tags, action.payload] };

    case "UPDATE_TAG":
      return {
        ...state,
        tags: state.tags.map((t) =>
          t.id === action.payload.id ? action.payload : t,
        ),
      };

    case "DELETE_TAG":
      return {
        ...state,
        tags: state.tags.filter((t) => t.id !== action.payload),
        tasks: state.tasks.map((task) => ({
          ...task,
          tagIds: task.tagIds?.filter((id) => id !== action.payload),
        })),
      };

    case "MARK_REMINDER_NOTIFIED":
      return {
        ...state,
        tasks: state.tasks.map((task) => {
          if (task.id !== action.payload.taskId) return task;
          return {
            ...task,
            reminders: task.reminders?.map((r) =>
              r.id === action.payload.reminderId ? { ...r, notified: true } : r,
            ),
          };
        }),
      };

    // Task Dependencies
    case "ADD_DEPENDENCY":
      return {
        ...state,
        taskDependencies: [...state.taskDependencies, action.payload],
      };

    case "DELETE_DEPENDENCY":
      return {
        ...state,
        taskDependencies: state.taskDependencies.filter(
          (d) => d.id !== action.payload,
        ),
      };

    // Task Templates
    case "ADD_TEMPLATE":
      return {
        ...state,
        taskTemplates: [...state.taskTemplates, action.payload],
      };

    case "UPDATE_TEMPLATE":
      return {
        ...state,
        taskTemplates: state.taskTemplates.map((t) =>
          t.id === action.payload.id ? action.payload : t,
        ),
      };

    case "DELETE_TEMPLATE":
      return {
        ...state,
        taskTemplates: state.taskTemplates.filter(
          (t) => t.id !== action.payload,
        ),
      };

    // Milestones
    case "ADD_MILESTONE":
      return {
        ...state,
        milestones: [...state.milestones, action.payload],
      };

    case "UPDATE_MILESTONE":
      return {
        ...state,
        milestones: state.milestones.map((m) =>
          m.id === action.payload.id ? action.payload : m,
        ),
      };

    case "DELETE_MILESTONE":
      return {
        ...state,
        milestones: state.milestones.filter((m) => m.id !== action.payload),
        // Remove milestone from tasks
        tasks: state.tasks.map((t) =>
          t.milestoneId === action.payload
            ? { ...t, milestoneId: undefined }
            : t,
        ),
      };

    // Comments
    case "ADD_COMMENT": {
      const comment = action.payload;
      const task = state.tasks.find((t) => t.id === comment.taskId);
      const activityLog: ActivityLog = {
        id: `activity-${Date.now()}`,
        projectId: task?.projectId,
        taskId: comment.taskId,
        action: "comment_added",
        details: {
          taskTitle: task?.title || "Unknown",
          commentPreview: comment.content.substring(0, 50),
        },
        createdAt: new Date(),
      };
      return {
        ...state,
        comments: [...state.comments, comment],
        activityLogs: [...state.activityLogs, activityLog],
      };
    }

    case "UPDATE_COMMENT":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.payload.id ? action.payload : c,
        ),
      };

    case "DELETE_COMMENT":
      return {
        ...state,
        comments: state.comments.filter((c) => c.id !== action.payload),
      };

    // Activity Logs
    case "LOG_ACTIVITY":
      return {
        ...state,
        activityLogs: [action.payload, ...state.activityLogs].slice(0, 100),
      };

    // Attachments
    case "ADD_ATTACHMENT":
      return {
        ...state,
        attachments: [...state.attachments, action.payload],
      };

    case "DELETE_ATTACHMENT":
      return {
        ...state,
        attachments: state.attachments.filter((a) => a.id !== action.payload),
      };

    // Project Notes
    case "ADD_NOTE":
      return {
        ...state,
        projectNotes: [...state.projectNotes, action.payload],
      };

    case "UPDATE_NOTE":
      return {
        ...state,
        projectNotes: state.projectNotes.map((n) =>
          n.id === action.payload.id ? action.payload : n,
        ),
      };

    case "DELETE_NOTE":
      return {
        ...state,
        projectNotes: state.projectNotes.filter((n) => n.id !== action.payload),
      };

    case "REORDER_NOTES": {
      const noteIds = action.payload;
      const updatedNotes = state.projectNotes.map((note) => {
        const newOrder = noteIds.indexOf(note.id);
        if (newOrder !== -1) {
          return { ...note, displayOrder: newOrder };
        }
        return note;
      });
      return { ...state, projectNotes: updatedNotes };
    }

    // Misc Categories
    case "ADD_CATEGORY":
      return {
        ...state,
        miscCategories: [...state.miscCategories, action.payload],
      };

    case "UPDATE_CATEGORY":
      return {
        ...state,
        miscCategories: state.miscCategories.map((c) =>
          c.id === action.payload.id ? action.payload : c,
        ),
      };

    case "DELETE_CATEGORY":
      return {
        ...state,
        miscCategories: state.miscCategories.filter(
          (c) => c.id !== action.payload,
        ),
        // Also clear categoryId from tasks in this category
        tasks: state.tasks.map((t) =>
          t.categoryId === action.payload ? { ...t, categoryId: undefined } : t,
        ),
      };

    case "LOAD_STATE":
      return {
        ...state,
        ...action.payload,
        completedToday: recalculateCompletedToday(
          action.payload.tasks || state.tasks,
        ),
        isLoading: false,
      };

    case "SET_LOADING":
      return { ...state, isLoading: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload, isLoading: false };

    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  getFocus3Tasks: () => Task[];
  getTodayFocusMinutes: () => number;
  getMomentumScore: () => number;
  getActiveProjects: () => Project[];
  getSubtasks: (taskId: string) => Task[];
  getTaskDependencies: (taskId: string) => TaskDependency[];
  getBlockingTasks: (taskId: string) => Task[];
  isTaskBlocked: (taskId: string) => boolean;
  getTaskComments: (taskId: string) => Comment[];
  getTaskAttachments: (taskId: string) => Attachment[];
  getProjectNotes: (projectId: string) => ProjectNote[];
  getProjectMilestones: (projectId: string) => Milestone[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, emptyState);
  const [pendingActions, setPendingActions] = useState<Action[]>([]);

  // Load data from Supabase on mount
  useEffect(() => {
    async function loadData() {
      try {
        dispatch({ type: "SET_LOADING", payload: true });
        const data = await db.loadAllData();
        dispatch({
          type: "LOAD_STATE",
          payload: {
            projects: data.projects,
            tasks: data.tasks,
            inbox: data.inbox,
            focusSessions: data.focusSessions,
            tags: data.tags,
            taskDependencies: data.taskDependencies,
            taskTemplates: data.taskTemplates,
            milestones: data.milestones,
            comments: data.comments,
            activityLogs: data.activityLogs,
            attachments: data.attachments,
            projectNotes: data.projectNotes,
            miscCategories: data.miscCategories,
          },
        });
      } catch (error) {
        console.error("Failed to load data from Supabase:", error);
        dispatch({
          type: "SET_ERROR",
          payload: "Failed to load data. Please check your connection.",
        });
      }
    }
    loadData();
  }, []);

  // Sync actions to Supabase
  useEffect(() => {
    if (pendingActions.length === 0) return;

    const action = pendingActions[0];

    async function syncAction() {
      try {
        switch (action.type) {
          case "ADD_PROJECT":
            await db.createProject(action.payload);
            break;
          case "UPDATE_PROJECT":
            await db.updateProject(action.payload);
            break;
          case "ADD_TASK":
            await db.createTask(action.payload);
            break;
          case "UPDATE_TASK":
            await db.updateTask(action.payload);
            break;
          case "DELETE_TASK":
            await db.deleteTask(action.payload);
            break;
          case "REORDER_TASKS": {
            const updates = action.payload.taskIds.map((id, index) => ({
              id,
              displayOrder: index,
            }));
            await db.updateTaskOrders(updates);
            break;
          }
          case "REORDER_PROJECTS": {
            const updates = action.payload.map((id, index) => ({
              id,
              displayOrder: index,
            }));
            await db.updateProjectOrders(updates);
            break;
          }
          case "ADD_INBOX_ITEM":
            await db.createInboxItem(action.payload);
            break;
          case "REMOVE_INBOX_ITEM":
            await db.deleteInboxItem(action.payload);
            break;
          case "START_FOCUS":
            await db.createFocusSession(action.payload);
            break;
          case "END_FOCUS":
            if (state.activeFocusSession) {
              const session = {
                ...state.activeFocusSession,
                endTime: new Date(),
                minutes: action.payload.minutes,
                notes: action.payload.notes,
              };
              await db.updateFocusSession(session);
              const task = state.tasks.find((t) => t.id === session.taskId);
              if (task) {
                await db.updateTask({
                  ...task,
                  focusMinutes: task.focusMinutes + action.payload.minutes,
                });
              }
              const project = state.projects.find(
                (p) => p.id === session.projectId,
              );
              if (project) {
                await db.updateProject({
                  ...project,
                  totalFocusMinutes:
                    project.totalFocusMinutes + action.payload.minutes,
                });
              }
            }
            break;
          case "UPDATE_SCRATCHPAD": {
            const project = state.projects.find(
              (p) => p.id === action.payload.projectId,
            );
            if (project) {
              await db.updateProject({
                ...project,
                scratchpad: action.payload.content,
              });
            }
            break;
          }
          case "ADD_TAG":
            await db.createTag(action.payload);
            break;
          case "UPDATE_TAG":
            await db.updateTag(action.payload);
            break;
          case "DELETE_TAG":
            await db.deleteTag(action.payload);
            break;
          case "MARK_REMINDER_NOTIFIED": {
            const task = state.tasks.find(
              (t) => t.id === action.payload.taskId,
            );
            if (task) {
              await db.updateTask({
                ...task,
                reminders: task.reminders?.map((r) =>
                  r.id === action.payload.reminderId
                    ? { ...r, notified: true }
                    : r,
                ),
              });
            }
            break;
          }
          // Task Dependencies
          case "ADD_DEPENDENCY":
            await db.createTaskDependency(action.payload);
            break;
          case "DELETE_DEPENDENCY":
            await db.deleteTaskDependency(action.payload);
            break;
          // Task Templates
          case "ADD_TEMPLATE":
            await db.createTaskTemplate(action.payload);
            break;
          case "UPDATE_TEMPLATE":
            await db.updateTaskTemplate(action.payload);
            break;
          case "DELETE_TEMPLATE":
            await db.deleteTaskTemplate(action.payload);
            break;
          // Milestones
          case "ADD_MILESTONE":
            await db.createMilestone(action.payload);
            break;
          case "UPDATE_MILESTONE":
            await db.updateMilestone(action.payload);
            break;
          case "DELETE_MILESTONE":
            await db.deleteMilestone(action.payload);
            break;
          // Comments
          case "ADD_COMMENT":
            await db.createComment(action.payload);
            break;
          case "UPDATE_COMMENT":
            await db.updateComment(action.payload);
            break;
          case "DELETE_COMMENT":
            await db.deleteComment(action.payload);
            break;
          // Activity Logs
          case "LOG_ACTIVITY":
            await db.createActivityLog(action.payload);
            break;
          // Attachments
          case "ADD_ATTACHMENT":
            await db.createAttachment(action.payload);
            break;
          case "DELETE_ATTACHMENT":
            await db.deleteAttachment(action.payload);
            break;
          // Project Notes
          case "ADD_NOTE":
            await db.createProjectNote(action.payload);
            break;
          case "UPDATE_NOTE":
            await db.updateProjectNote(action.payload);
            break;
          case "DELETE_NOTE":
            await db.deleteProjectNote(action.payload);
            break;
          // Misc Categories
          case "ADD_CATEGORY":
            await db.createMiscCategory(action.payload);
            break;
          case "UPDATE_CATEGORY":
            await db.updateMiscCategory(action.payload);
            break;
          case "DELETE_CATEGORY":
            await db.deleteMiscCategory(action.payload);
            break;
        }
      } catch (error) {
        console.error("Failed to sync action to Supabase:", error);
      }

      setPendingActions((prev) => prev.slice(1));
    }

    syncAction();
  }, [pendingActions, state.activeFocusSession, state.tasks, state.projects]);

  const syncedDispatch = useCallback((action: Action) => {
    dispatch(action);
    if (
      action.type !== "LOAD_STATE" &&
      action.type !== "SET_LOADING" &&
      action.type !== "SET_ERROR"
    ) {
      setPendingActions((prev) => [...prev, action]);
    }
  }, []);

  const getFocus3Tasks = useCallback((): Task[] => {
    const now = new Date();
    const today = now.toDateString();

    // Only get top-level tasks (no subtasks)
    const activeTasks = state.tasks.filter(
      (t) => t.status !== "completed" && !t.parentTaskId,
    );

    const scored = activeTasks.map((task) => {
      let score = 0;
      const dueDate = task.dueDate ? new Date(task.dueDate) : null;

      if (dueDate && dueDate < now && dueDate.toDateString() !== today) {
        score += 1000;
      }

      if (dueDate && dueDate.toDateString() === today) {
        if (task.priority === "critical") score += 500;
        else if (task.priority === "high") score += 400;
        else if (task.priority === "medium") score += 200;
        else score += 100;
      }

      if (task.status === "in_progress") {
        score += 300;
      }

      if (task.priority === "critical") score += 50;
      else if (task.priority === "high") score += 30;
      else if (task.priority === "medium") score += 15;

      return { task, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.task);
  }, [state.tasks]);

  const getTodayFocusMinutes = useCallback((): number => {
    const today = new Date().toDateString();
    return state.focusSessions
      .filter((s) => new Date(s.startTime).toDateString() === today)
      .reduce((acc, s) => acc + s.minutes, 0);
  }, [state.focusSessions]);

  const getMomentumScore = useCallback((): number => {
    const completedCount = state.completedToday.length;
    const todayFocusMinutes = state.focusSessions
      .filter(
        (s) =>
          new Date(s.startTime).toDateString() === new Date().toDateString(),
      )
      .reduce((acc, s) => acc + s.minutes, 0);
    const criticalCompleted = state.completedToday.filter(
      (t) => t.priority === "critical" || t.priority === "high",
    ).length;

    const baseScore = completedCount * 10;
    const focusBonus = Math.min(todayFocusMinutes / 2, 30);
    const priorityBonus = criticalCompleted * 15;

    return Math.min(Math.round(baseScore + focusBonus + priorityBonus), 100);
  }, [state.completedToday, state.focusSessions]);

  const getActiveProjects = useCallback((): Project[] => {
    return state.projects.filter((p) => !p.archived);
  }, [state.projects]);

  const getSubtasks = useCallback(
    (taskId: string): Task[] => {
      return state.tasks
        .filter((t) => t.parentTaskId === taskId)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    },
    [state.tasks],
  );

  const getTaskDependencies = useCallback(
    (taskId: string): TaskDependency[] => {
      return state.taskDependencies.filter((d) => d.taskId === taskId);
    },
    [state.taskDependencies],
  );

  const getBlockingTasks = useCallback(
    (taskId: string): Task[] => {
      const deps = state.taskDependencies.filter((d) => d.taskId === taskId);
      return deps
        .map((d) => state.tasks.find((t) => t.id === d.dependsOnTaskId))
        .filter((t): t is Task => t !== undefined && t.status !== "completed");
    },
    [state.taskDependencies, state.tasks],
  );

  const isTaskBlocked = useCallback(
    (taskId: string): boolean => {
      return getBlockingTasks(taskId).length > 0;
    },
    [getBlockingTasks],
  );

  const getTaskComments = useCallback(
    (taskId: string): Comment[] => {
      return state.comments
        .filter((c) => c.taskId === taskId)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
    },
    [state.comments],
  );

  const getTaskAttachments = useCallback(
    (taskId: string): Attachment[] => {
      return state.attachments.filter((a) => a.taskId === taskId);
    },
    [state.attachments],
  );

  const getProjectNotes = useCallback(
    (projectId: string): ProjectNote[] => {
      return state.projectNotes
        .filter((n) => n.projectId === projectId)
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
        });
    },
    [state.projectNotes],
  );

  const getProjectMilestones = useCallback(
    (projectId: string): Milestone[] => {
      return state.milestones
        .filter((m) => m.projectId === projectId)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    },
    [state.milestones],
  );

  const contextValue = useMemo(
    () => ({
      state,
      dispatch: syncedDispatch,
      getFocus3Tasks,
      getTodayFocusMinutes,
      getMomentumScore,
      getActiveProjects,
      getSubtasks,
      getTaskDependencies,
      getBlockingTasks,
      isTaskBlocked,
      getTaskComments,
      getTaskAttachments,
      getProjectNotes,
      getProjectMilestones,
    }),
    [
      state,
      syncedDispatch,
      getFocus3Tasks,
      getTodayFocusMinutes,
      getMomentumScore,
      getActiveProjects,
      getSubtasks,
      getTaskDependencies,
      getBlockingTasks,
      isTaskBlocked,
      getTaskComments,
      getTaskAttachments,
      getProjectNotes,
      getProjectMilestones,
    ],
  );

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
