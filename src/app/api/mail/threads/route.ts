import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listThreads } from "@/lib/gmail";

// GET /api/mail/threads?q=<gmail query>
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const q = new URL(req.url).searchParams.get("q") || "in:inbox";
  try {
    const threads = await listThreads(session.accessToken, q, 25);
    return NextResponse.json({ threads });
  } catch (err) {
    console.error("Mail threads error:", err);
    return NextResponse.json({ error: "Failed to load mail" }, { status: 500 });
  }
}
