import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// GET /api/granola/meetings/[id] — full meeting incl. transcript.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const { data: meeting } = await supabase
      .from("granola_meetings")
      .select("id, title, meeting_date, attendees, summary, owner_name")
      .eq("id", id)
      .maybeSingle();
    if (!meeting) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { data: tr } = await supabase
      .from("granola_transcripts")
      .select("transcript")
      .eq("meeting_id", id)
      .maybeSingle();
    return NextResponse.json({
      meeting,
      transcript: (tr?.transcript as string) || "",
    });
  } catch (err) {
    console.error("Granola meeting detail error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load meeting" },
      { status: 500 },
    );
  }
}

// DELETE /api/granola/meetings/[id] — soft-delete (hide) a meeting and drop any
// of its extracted-task candidates. The transcript stays as a tombstone so the
// sync won't re-pull it from Granola.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const { error } = await supabase
      .from("granola_meetings")
      .update({ hidden: true })
      .eq("id", id);
    if (error) throw error;
    await supabase
      .from("granola_extracted_tasks")
      .delete()
      .eq("meeting_id", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Granola meeting delete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 },
    );
  }
}
