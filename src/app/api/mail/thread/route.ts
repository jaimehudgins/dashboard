import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getThread } from "@/lib/gmail";

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
    return NextResponse.json({ thread });
  } catch (err) {
    console.error("Mail thread error:", err);
    return NextResponse.json({ error: "Failed to load thread" }, { status: 500 });
  }
}
