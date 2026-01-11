"use client";

import React, { useEffect, useState, useCallback } from "react";
import { isSameDay, startOfDay } from "date-fns";
import { useApp } from "@/store/store";
import { Task, Reminder, EnergyTimeSlot } from "@/types";
import ReminderToast from "./ReminderToast";
import EnergyReminderToast from "./EnergyReminderToast";

interface ActiveReminder {
  task: Task;
  reminder: Reminder;
}

interface EnergyReminder {
  id: string;
  timeSlot: EnergyTimeSlot;
  label: string;
}

const TIME_SLOT_CONFIG: Record<
  EnergyTimeSlot,
  { label: string; startHour: number; endHour: number }
> = {
  morning: { label: "Morning", startHour: 6, endHour: 11 },
  midday: { label: "Midday", startHour: 11, endHour: 14 },
  afternoon: { label: "Afternoon", startHour: 14, endHour: 18 },
  evening: { label: "Evening", startHour: 18, endHour: 22 },
};

export default function ReminderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { state, dispatch } = useApp();
  const [activeReminders, setActiveReminders] = useState<ActiveReminder[]>([]);
  const [energyReminder, setEnergyReminder] = useState<EnergyReminder | null>(
    null,
  );
  const [dismissedEnergySlots, setDismissedEnergySlots] = useState<Set<string>>(
    new Set(),
  );

  // Get current time slot based on hour
  const getCurrentTimeSlot = useCallback((): EnergyTimeSlot | null => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 11) return "morning";
    if (hour >= 11 && hour < 14) return "midday";
    if (hour >= 14 && hour < 18) return "afternoon";
    if (hour >= 18 && hour < 22) return "evening";
    return null; // Outside tracking hours
  }, []);

  // Check if energy has been logged for a time slot today
  const hasLoggedEnergyForSlot = useCallback(
    (slot: EnergyTimeSlot): boolean => {
      const today = startOfDay(new Date());
      return state.energyLogs.some(
        (log) => log.timeSlot === slot && isSameDay(new Date(log.date), today),
      );
    },
    [state.energyLogs],
  );

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

  // Check energy logging reminders
  const checkEnergyReminders = useCallback(() => {
    const currentSlot = getCurrentTimeSlot();
    if (!currentSlot) return; // Outside tracking hours

    const hour = new Date().getHours();
    const slotConfig = TIME_SLOT_CONFIG[currentSlot];

    // Only remind in the middle/end of the time slot (not immediately at start)
    // Remind after 1 hour into the slot
    const shouldRemind = hour >= slotConfig.startHour + 1;

    if (!shouldRemind) return;

    // Check if already logged or dismissed for this slot today
    const todayKey = `${startOfDay(new Date()).toISOString()}-${currentSlot}`;
    if (
      hasLoggedEnergyForSlot(currentSlot) ||
      dismissedEnergySlots.has(todayKey)
    ) {
      setEnergyReminder(null);
      return;
    }

    // Show reminder if not already showing
    if (!energyReminder || energyReminder.timeSlot !== currentSlot) {
      setEnergyReminder({
        id: todayKey,
        timeSlot: currentSlot,
        label: slotConfig.label,
      });
    }
  }, [
    getCurrentTimeSlot,
    hasLoggedEnergyForSlot,
    dismissedEnergySlots,
    energyReminder,
  ]);

  // Check reminders every 30 seconds
  useEffect(() => {
    checkReminders();
    checkEnergyReminders();

    const interval = setInterval(() => {
      checkReminders();
      checkEnergyReminders();
    }, 30000);

    return () => clearInterval(interval);
  }, [checkReminders, checkEnergyReminders]);

  // Clear energy reminder when energy is logged
  useEffect(() => {
    if (energyReminder && hasLoggedEnergyForSlot(energyReminder.timeSlot)) {
      setEnergyReminder(null);
    }
  }, [state.energyLogs, energyReminder, hasLoggedEnergyForSlot]);

  const dismissReminder = (taskId: string, reminderId: string) => {
    setActiveReminders((prev) =>
      prev.filter(
        (ar) => !(ar.task.id === taskId && ar.reminder.id === reminderId),
      ),
    );
  };

  const dismissEnergyReminder = () => {
    if (energyReminder) {
      setDismissedEnergySlots((prev) => new Set(prev).add(energyReminder.id));
      setEnergyReminder(null);
    }
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
        {/* Energy Reminder */}
        {energyReminder && (
          <EnergyReminderToast
            timeSlot={energyReminder.timeSlot}
            label={energyReminder.label}
            onDismiss={dismissEnergyReminder}
          />
        )}

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
