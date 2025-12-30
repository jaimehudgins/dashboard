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

  const checkReminders = useCallback(() => {
    const now = new Date();
    const newReminders: ActiveReminder[] = [];

    state.tasks.forEach((task) => {
      if (!task.dueDate || !task.reminders || task.status === "completed") return;

      const dueDate = new Date(task.dueDate);

      task.reminders.forEach((reminder) => {
        if (reminder.notified) return;

        // Calculate when this reminder should trigger
        const reminderTime = new Date(
          dueDate.getTime() - reminder.minutesBefore * 60 * 1000
        );

        // Check if reminder should trigger (within the last 60 seconds to avoid missing)
        const timeDiff = now.getTime() - reminderTime.getTime();
        if (timeDiff >= 0 && timeDiff < 60000) {
          // Check if we haven't already shown this reminder in this session
          const alreadyShown = activeReminders.some(
            (ar) => ar.task.id === task.id && ar.reminder.id === reminder.id
          );

          if (!alreadyShown) {
            newReminders.push({ task, reminder });

            // Mark reminder as notified
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
    // Initial check
    checkReminders();

    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [checkReminders]);

  const dismissReminder = (taskId: string, reminderId: string) => {
    setActiveReminders((prev) =>
      prev.filter(
        (ar) => !(ar.task.id === taskId && ar.reminder.id === reminderId)
      )
    );
  };

  // Auto-dismiss reminders after 10 seconds
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
      {activeReminders.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-3">
          {activeReminders.slice(0, 3).map((ar) => (
            <ReminderToast
              key={`${ar.task.id}-${ar.reminder.id}`}
              task={ar.task}
              onDismiss={() => dismissReminder(ar.task.id, ar.reminder.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
