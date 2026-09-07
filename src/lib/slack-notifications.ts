import { supabase } from "./supabase";
import {
  claimNotification,
  completeNotification,
  failNotification,
  LeoNotificationKind,
} from "./notification-store";
import {
  isSlackNotificationsConfigured,
  postSlackNotification,
} from "./slack";
import type { UrgentPartnerThread } from "./mail-classify";

function slackText(value: string | null | undefined): string {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function leoUrl(path: string): string {
  const configured = process.env.NEXTAUTH_URL?.trim();
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const base = configured || (vercel ? `https://${vercel}` : "");
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

async function sendOnce(input: {
  key: string;
  kind: LeoNotificationKind;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<"sent" | "duplicate" | "disabled"> {
  if (!isSlackNotificationsConfigured) return "disabled";
  const claim = await claimNotification({
    key: input.key,
    kind: input.kind,
    title: input.title,
    metadata: input.metadata,
  });
  if (claim.duplicate) return "duplicate";
  try {
    const posted = await postSlackNotification(input.content);
    await completeNotification(claim.id, {
      content: input.content,
      slackChannel: posted.channel,
      slackTs: posted.ts,
      metadata: input.metadata,
    });
    return "sent";
  } catch (error) {
    await failNotification(claim.id, error);
    throw error;
  }
}

export async function sendUrgentPartnerEmailAlerts(
  threads: UrgentPartnerThread[],
): Promise<{ sent: number; duplicates: number; disabled: boolean }> {
  if (!isSlackNotificationsConfigured) {
    return { sent: 0, duplicates: 0, disabled: true };
  }
  let sent = 0;
  let duplicates = 0;
  for (const thread of threads.slice(0, 8)) {
    const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(
      thread.id,
    )}`;
    const content = [
      "🚨 *Partner email needs attention*",
      `*${slackText(thread.subject || "Email without a subject")}*`,
      `From: ${slackText(thread.from)}`,
      `Why Leo alerted you: ${slackText(thread.reason)}`,
      `<${gmailUrl}|Open in Gmail> · <${leoUrl("/mail")}|Open in Leo>`,
    ].join("\n");
    const result = await sendOnce({
      key: `urgent:gmail:${thread.id}:${thread.lastMessageId}`,
      kind: "urgent_email",
      title: thread.subject || "Urgent partner email",
      content,
      metadata: {
        threadId: thread.id,
        messageFingerprint: thread.lastMessageId,
        confidence: thread.confidence,
      },
    });
    if (result === "sent") sent += 1;
    if (result === "duplicate") duplicates += 1;
  }
  return { sent, duplicates, disabled: false };
}

interface WorkbenchAlertRow {
  id: string;
  task_id: string;
  task_title: string;
  status: string;
  draft_title: string | null;
  notification_reason: string | null;
  updated_at: string;
}

export async function sendPendingWorkbenchAlerts(): Promise<{
  sent: number;
  duplicates: number;
  disabled: boolean;
}> {
  if (!isSlackNotificationsConfigured) {
    return { sent: 0, duplicates: 0, disabled: true };
  }
  const { data, error } = await supabase
    .from("work_runs")
    .select(
      "id, task_id, task_title, status, draft_title, notification_reason, updated_at",
    )
    .eq("notification_tier", "immediate")
    .is("notification_sent_at", null)
    .in("status", ["draft_ready", "needs_input"])
    .order("updated_at", { ascending: true })
    .limit(10);
  if (error) throw error;

  let sent = 0;
  let duplicates = 0;
  for (const row of (data ?? []) as WorkbenchAlertRow[]) {
    const ready = row.status === "draft_ready";
    const content = [
      ready ? "✅ *Leo draft ready*" : "❓ *Leo needs your input*",
      `*${slackText(row.draft_title || row.task_title)}*`,
      slackText(
        row.notification_reason ||
          (ready
            ? "A high-priority draft is ready for review."
            : "A pressing task is blocked on your input."),
      ),
      `<${leoUrl("/work")}|Open the Workbench>`,
    ].join("\n");
    const result = await sendOnce({
      key: `workbench:${row.id}:${row.updated_at}`,
      kind: "workbench_ready",
      title: row.draft_title || row.task_title,
      content,
      metadata: { workRunId: row.id, taskId: row.task_id, status: row.status },
    });
    if (result === "sent" || result === "duplicate") {
      await supabase
        .from("work_runs")
        .update({ notification_sent_at: new Date().toISOString() })
        .eq("id", row.id);
    }
    if (result === "sent") sent += 1;
    if (result === "duplicate") duplicates += 1;
  }
  return { sent, duplicates, disabled: false };
}

export async function sendSlackDigest(input: {
  key: string;
  kind: "morning" | "evening" | "test";
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  return sendOnce(input);
}
