"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useApp } from "@/store/store";

// First-version desktop notifications: fire while a Leo tab is open (Web
// Notifications API) for new urgent (🔥) emails and tasks due today. A service
// worker + Web Push would add closed-tab delivery later.

function senderName(from: string): string {
  const m = from.match(/^"?([^"<]+?)"?\s*</);
  return (m ? m[1] : from).trim();
}

export default function NotificationManager() {
  const { state } = useApp();
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
    try {
      seenRef.current = new Set(
        JSON.parse(localStorage.getItem("leo.notified") || "[]"),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const enable = async () => {
    if (typeof Notification === "undefined") return;
    setPerm(await Notification.requestPermission());
  };

  const remember = (id: string) => {
    seenRef.current.add(id);
    try {
      localStorage.setItem(
        "leo.notified",
        JSON.stringify([...seenRef.current].slice(-200)),
      );
    } catch {
      /* ignore */
    }
  };

  const notify = useCallback((title: string, body: string, url: string) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted")
      return;
    const n = new Notification(title, { body, icon: "/favicon.ico", tag: url });
    n.onclick = () => {
      window.focus();
      if (url) window.location.href = url;
      n.close();
    };
  }, []);

  // Poll for new urgent (🔥) unread emails.
  const pollMail = useCallback(async () => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted")
      return;
    try {
      const r = await fetch("/api/mail/threads?view=all");
      if (!r.ok) return;
      const d = await r.json();
      for (const t of d.threads || []) {
        if (t.urgency === "now" && t.unread && !seenRef.current.has(t.id)) {
          remember(t.id);
          notify(
            "🔥 Needs attention",
            `${senderName(t.from)} — ${t.subject || "(no subject)"}`,
            "/mail",
          );
        }
      }
    } catch {
      /* ignore */
    }
  }, [notify]);

  useEffect(() => {
    if (perm !== "granted") return;
    pollMail();
    const iv = setInterval(pollMail, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [perm, pollMail]);

  // Tasks due today — notify once per day.
  useEffect(() => {
    if (perm !== "granted") return;
    const dayKey = `leo.notified.tasks.${new Date().toISOString().slice(0, 10)}`;
    try {
      if (localStorage.getItem(dayKey)) return;
    } catch {
      return;
    }
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const due = state.tasks.filter(
      (t) =>
        t.status !== "completed" &&
        !t.parentTaskId &&
        t.dueDate &&
        new Date(t.dueDate) >= start &&
        new Date(t.dueDate) <= today,
    );
    if (due.length > 0) {
      notify(
        `${due.length} task${due.length > 1 ? "s" : ""} due today`,
        due.slice(0, 3).map((t) => t.title).join(", ") +
          (due.length > 3 ? "…" : ""),
        "/",
      );
      try {
        localStorage.setItem(dayKey, "1");
      } catch {
        /* ignore */
      }
    }
  }, [perm, state.tasks, notify]);

  if (typeof Notification === "undefined") return null;

  return (
    <button
      onClick={enable}
      disabled={perm === "denied"}
      title={
        perm === "denied"
          ? "Notifications are blocked in your browser settings"
          : perm === "granted"
            ? "Desktop notifications are on"
            : "Enable desktop notifications"
      }
      className="w-full flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-60 disabled:hover:text-slate-500 mt-3 transition-colors"
    >
      {perm === "granted" ? <Bell size={13} /> : <BellOff size={13} />}
      {perm === "granted"
        ? "Notifications on"
        : perm === "denied"
          ? "Notifications blocked"
          : "Enable notifications"}
    </button>
  );
}
