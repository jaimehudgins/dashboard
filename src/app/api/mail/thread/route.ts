import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { crmSupabase, isCrmConfigured } from "@/lib/crm-supabase";
import { getThread } from "@/lib/gmail";
import { isOwnReply } from "@/lib/gmail-history";

async function temuStatus(threadId: string, latestMessageDate: string | undefined) {
  if (!isCrmConfigured) return null;
  const { data, error } = await crmSupabase
    .from("touchpoints")
    .select("id, source_created_at, updated_at")
    .eq("source_system", "leo:temu")
    .eq("source_external_id", `gmail-thread:${threadId}`)
    .maybeSingle();
  if (error) {
    console.warn("Could not read TEMU status for email thread", error.message);
    return null;
  }
  if (!data) return null;

  const latestDate = latestMessageDate ? new Date(latestMessageDate) : null;
  const syncedThrough = data.source_created_at
    ? new Date(data.source_created_at)
    : null;
  const hasNewMessages = Boolean(
    latestDate &&
      !Number.isNaN(latestDate.valueOf()) &&
      (!syncedThrough ||
        Number.isNaN(syncedThrough.valueOf()) ||
        latestDate > syncedThrough),
  );
  return {
    touchpointId: data.id as string,
    syncedThrough: data.source_created_at as string | null,
    updatedAt: data.updated_at as string | null,
    hasNewMessages,
  };
}

// GET /api/mail/thread?id=<threadId>
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  try {
    const thread = await getThread(session.accessToken, id);
    const latestMessage = thread.messages[thread.messages.length - 1];
    const status = await temuStatus(id, latestMessage?.date);
    return NextResponse.json({ thread: {
      ...thread,
      messages: thread.messages.map((message) => ({
        ...message,
        isOwnMessage: isOwnReply({ from: message.from, lastMessageSent: message.sent }, session.user?.email ?? ""),
      })),
      temuStatus: status,
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Mail thread error:", err);
    return NextResponse.json({ error: "Failed to load thread" }, { status: 500 });
  }
}
