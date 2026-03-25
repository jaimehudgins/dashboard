"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useApp } from "@/store/store";
import { Task, Reminder } from "@/types";
import ReminderToast from "./ReminderToast";

interface ActiveReminder {
  task: Task;
  reminder: Reminder;
}

export default function ReminderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { state, dispatch } = useApp();
  const [activeReminders, setActiveReminders] = useState<ActiveReminder[]>([]);

  // Check task reminders
  const checkReminders = useCallback(() => {
    const now = new Date();
    const newReminders: ActiveReminder[] = [];

    state.tasks.forEach((task) => {
      if (!task.dueDate || !task.reminders || task.status === "completed")
        return;

      const dueDate = new Date(task.dueDate);

      task.reminders.forEach((reminder) => {
        if (reminder.notified) return;

        const reminderTime = new Date(
          dueDate.getTime() - reminder.minutesBefore * 60 * 1000,
        );

        const timeDiff = now.getTime() - reminderTime.getTime();
        if (timeDiff >= 0 && timeDiff < 60000) {
          const alreadyShown = activeReminders.some(
            (ar) => ar.task.id === task.id && ar.reminder.id === reminder.id,
          );

          if (!alreadyShown) {
            newReminders.push({ task, reminder });

            dispatch({
              type: "MARK_REMINDER_NOTIFIED",
              payload: { taskId: task.id, reminderId: reminder.id },
            });
          }
        }
      });
    });

    if (newReminders.length > 0) {
      setActiveReminders((prev) => [...prev, ...newReminders]);
    }
  }, [state.tasks, activeReminders, dispatch]);

  // Check reminders every 30 seconds
  useEffect(() => {
    checkReminders();

    const interval = setInterval(() => {
      checkReminders();
    }, 30000);

    return () => clearInterval(interval);
  }, [checkReminders]);

  const dismissReminder = (taskId: string, reminderId: string) => {
    setActiveReminders((prev) =>
      prev.filter(
        (ar) => !(ar.task.id === taskId && ar.reminder.id === reminderId),
      ),
    );
  };

  // Auto-dismiss task reminders after 10 seconds
  useEffect(() => {
    if (activeReminders.length === 0) return;

    const timeout = setTimeout(() => {
      setActiveReminders((prev) => prev.slice(1));
    }, 10000);

    return () => clearTimeout(timeout);
  }, [activeReminders]);

  return (
    <>
      {children}

      {/* Reminder Toasts Container */}
      <div className="fixed bottom-4 right-4 z-50 space-y-3">
        {/* Task Reminders */}
        {activeReminders.slice(0, 3).map((ar) => (
          <ReminderToast
            key={`${ar.task.id}-${ar.reminder.id}`}
            task={ar.task}
            onDismiss={() => dismissReminder(ar.task.id, ar.reminder.id)}
          />
        ))}
      </div>
    </>
  );
}
