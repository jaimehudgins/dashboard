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
import { Task, Project, InboxItem, FocusSession, Tag } from "@/types";
import * as db from "@/lib/database";

interface AppState {
  projects: Project[];
  tasks: Task[];
  inbox: InboxItem[];
  focusSessions: FocusSession[];
  activeFocusSession: FocusSession | null;
  completedToday: Task[];
  tags: Tag[];
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

    case "ADD_TASK":
      return { ...state, tasks: [...state.tasks, action.payload] };

    case "UPDATE_TASK": {
      const updatedTask = action.payload;
      const wasNotCompleted =
        state.tasks.find((t) => t.id === updatedTask.id)?.status !==
        "completed";
      const isNowCompleted = updatedTask.status === "completed";

      let newCompletedToday = state.completedToday;
      if (wasNotCompleted && isNowCompleted) {
        updatedTask.completedAt = new Date();
        newCompletedToday = [...state.completedToday, updatedTask];
      }

      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === updatedTask.id ? updatedTask : t,
        ),
        completedToday: newCompletedToday,
      };
    }

    case "DELETE_TASK":
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.payload),
      };

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
        // Also remove tag from all tasks
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
              // Also update the task and project focus minutes
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
        }
      } catch (error) {
        console.error("Failed to sync action to Supabase:", error);
      }

      // Remove processed action
      setPendingActions((prev) => prev.slice(1));
    }

    syncAction();
  }, [pendingActions, state.activeFocusSession, state.tasks, state.projects]);

  // Wrap dispatch to queue actions for Supabase sync
  const syncedDispatch = useCallback((action: Action) => {
    dispatch(action);
    // Queue action for Supabase sync (except LOAD_STATE and SET_* actions)
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

    const activeTasks = state.tasks.filter((t) => t.status !== "completed");

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

  const contextValue = useMemo(
    () => ({
      state,
      dispatch: syncedDispatch,
      getFocus3Tasks,
      getTodayFocusMinutes,
      getMomentumScore,
      getActiveProjects,
    }),
    [
      state,
      syncedDispatch,
      getFocus3Tasks,
      getTodayFocusMinutes,
      getMomentumScore,
      getActiveProjects,
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
