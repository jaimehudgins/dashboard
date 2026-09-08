import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { PartnerResponse, MailSyncState } from "@/types/partner-response";
import { supabase } from "./supabase";
import type { UrgentPartnerThread } from "./mail-classify";

export const responseStoreConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

export function responseDb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) throw new Error("Partner responses need SUPABASE_SERVICE_ROLE_KEY in Leo's server environment.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function storeError(error: { code?: string; message: string }): never {
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202") {
    throw new Error("Partner responses need the partner-response-queue.sql migration in Leo's Supabase.");
  }
  throw new Error(error.message);
}

export async function getResponse(threadId: string): Promise<PartnerResponse | null> {
  const { data, error } = await responseDb().from("partner_responses").select("*").eq("thread_id", threadId).maybeSingle();
  if (error) storeError(error);
  return data as PartnerResponse | null;
}

export async function updateResponse(threadId: string, version: number, patch: Partial<PartnerResponse>) {
  const { data, error } = await responseDb().from("partner_responses").update(patch)
    .eq("thread_id", threadId).eq("version", version).select("*").maybeSingle();
  if (error) storeError(error);
  if (!data) throw new Error("This response changed in another tab or sync. Reload it before saving; your text has not been overwritten.");
  return data as PartnerResponse;
}

export async function getMailSyncState(): Promise<MailSyncState> {
  const { data, error } = await responseDb().from("partner_mail_sync").select("*").eq("id", "primary").single();
  if (error) storeError(error);
  return data as MailSyncState;
}

export async function pendingPartnerAlerts(): Promise<UrgentPartnerThread[]> {
  const { data, error } = await responseDb().from("partner_responses").select("*")
    .eq("urgency", "now").in("confidence", ["high", "medium"]).not("partner_id", "is", null)
    .in("status", ["needs_response", "needs_input", "draft_ready"])
    .order("received_at", { ascending: false }).limit(100);
  if (error) storeError(error);
  const rows = (data ?? []) as PartnerResponse[];
  if (!rows.length) return [];
  const keys = rows.map((row) => `urgent:gmail:${row.thread_id}:${row.message_id}`);
  const sent = await supabase.from("leo_notifications").select("notification_key").eq("status", "sent").in("notification_key", keys);
  if (sent.error) throw new Error("Could not check previously sent partner alerts.");
  const delivered = new Set((sent.data ?? []).map((row) => row.notification_key));
  return rows.filter((row, index) => !delivered.has(keys[index])).slice(0, 8).map((row) => ({
    id: row.thread_id, lastMessageId: row.message_id, from: row.sender,
    subject: row.subject, date: row.received_at ?? "", reason: row.reason,
    confidence: row.confidence === "high" ? "high" : "medium",
  }));
}
