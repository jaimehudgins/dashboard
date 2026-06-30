import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { confirmExtractedTask, dismissExtractedTask } from "@/lib/granola-route";

// POST /api/granola/tasks
//   { id, action: "confirm", task?, due_date?, partner_id?, partner_name? }
//   { id, action: "dismiss" }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: {
    id?: string;
    action?: string;
    task?: string;
    due_date?: string | null;
    partner_id?: string | null;
    partner_name?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.id || !body.action) {
    return NextResponse.json(
      { error: "id and action required" },
      { status: 400 },
    );
  }

  try {
    if (body.action === "dismiss") {
      await dismissExtractedTask(body.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "confirm") {
      const result = await confirmExtractedTask(body.id, {
        task: body.task,
        due_date: body.due_date,
        partner_id: body.partner_id,
        partner_name: body.partner_name,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Granola task action error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 },
    );
  }
}
