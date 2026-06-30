import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchDrive } from "@/lib/drive";

// GET /api/drive/search?q=...
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const q = new URL(req.url).searchParams.get("q") || "";
  try {
    const files = await searchDrive(session.accessToken, q, 30);
    return NextResponse.json({ files });
  } catch (err) {
    console.error("Drive search error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Drive search failed" },
      { status: 500 },
    );
  }
}
