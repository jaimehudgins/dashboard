import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// GET /api/granola/meetings — recent meetings with their extracted tasks.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const { data: meetings, error } = await supabase
      .from("granola_meetings")
      .select("id, title, meeting_date, attendees, summary, owner_name")
      .order("meeting_date", { ascending: false })
      .limit(60);
    if (error) throw error;

    const ids = (meetings || []).map((m) => m.id);
    const tasksByMeeting: Record<string, unknown[]> = {};
    if (ids.length > 0) {
      const { data: tasks } = await supabase
        .from("granola_extracted_tasks")
        .select("*")
        .in("meeting_id", ids)
        // Dismissed/ignored items leave the review view for good.
        .neq("status", "dismissed")
        .order("created_at", { ascending: true });
      for (const t of tasks || []) {
        (tasksByMeeting[t.meeting_id as string] ||= []).push(t);
      }
    }

    return NextResponse.json({
      meetings: (meetings || []).map((m) => ({
        ...m,
        tasks: tasksByMeeting[m.id as string] || [],
      })),
    });
  } catch (err) {
    console.error("Granola meetings error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load meetings" },
      { status: 500 },
    );
  }
}
