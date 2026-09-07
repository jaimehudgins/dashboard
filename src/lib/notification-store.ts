import { supabase } from "./supabase";

export type LeoNotificationKind =
  | "urgent_email"
  | "workbench_ready"
  | "morning"
  | "evening"
  | "test";

interface NotificationClaim {
  id: string;
  duplicate: boolean;
}

function isMissingTable(error: { message?: string } | null): boolean {
  return Boolean(error?.message?.includes("leo_notifications"));
}

export async function claimNotification(input: {
  key: string;
  kind: LeoNotificationKind;
  title?: string;
  metadata?: Record<string, unknown>;
}): Promise<NotificationClaim> {
  const { data: existing, error: selectError } = await supabase
    .from("leo_notifications")
    .select("id, status, updated_at")
    .eq("notification_key", input.key)
    .maybeSingle();
  if (selectError) {
    if (isMissingTable(selectError)) {
      throw new Error("Slack notifications need the leo-notifications.sql migration.");
    }
    throw selectError;
  }
  const pendingIsFresh =
    existing?.status === "pending" &&
    Date.now() - new Date(existing.updated_at as string).getTime() < 10 * 60 * 1000;
  if (existing?.status === "sent" || pendingIsFresh) {
    return { id: existing.id as string, duplicate: true };
  }
  if (existing?.id) {
    const { error } = await supabase
      .from("leo_notifications")
      .update({
        status: "pending",
        title: input.title ?? null,
        metadata: input.metadata ?? {},
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    return { id: existing.id as string, duplicate: false };
  }

  const { data, error } = await supabase
    .from("leo_notifications")
    .insert({
      notification_key: input.key,
      kind: input.kind,
      title: input.title ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingTable(error)) {
      throw new Error("Slack notifications need the leo-notifications.sql migration.");
    }
    // Another cron invocation may have claimed the same notification first.
    if (error.code === "23505") return { id: "", duplicate: true };
    throw error;
  }
  return { id: data.id as string, duplicate: false };
}

export async function completeNotification(
  id: string,
  input: {
    content: string;
    slackChannel: string;
    slackTs: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase
    .from("leo_notifications")
    .update({
      status: "sent",
      content: input.content,
      slack_channel: input.slackChannel,
      slack_ts: input.slackTs,
      metadata: input.metadata ?? {},
      sent_at: new Date().toISOString(),
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function failNotification(id: string, error: unknown): Promise<void> {
  if (!id) return;
  const message = error instanceof Error ? error.message : "Notification failed";
  await supabase
    .from("leo_notifications")
    .update({
      status: "failed",
      error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function latestMorningNotification(dateKey: string): Promise<{
  content: string | null;
  metadata: Record<string, unknown>;
} | null> {
  const { data, error } = await supabase
    .from("leo_notifications")
    .select("content, metadata")
    .eq("notification_key", `morning:${dateKey}`)
    .eq("status", "sent")
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data
    ? {
        content: (data.content as string | null) ?? null,
        metadata: (data.metadata as Record<string, unknown>) ?? {},
      }
    : null;
}

export async function recentNotifications(limit = 12): Promise<unknown[]> {
  const { data, error } = await supabase
    .from("leo_notifications")
    .select("id, kind, status, title, sent_at, error")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data ?? [];
}

export async function notificationStoreConfigured(): Promise<boolean> {
  const { error } = await supabase
    .from("leo_notifications")
    .select("id", { head: true, count: "exact" })
    .limit(1);
  return !error;
}
