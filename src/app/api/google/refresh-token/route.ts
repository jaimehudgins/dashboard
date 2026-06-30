import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// One-time helper: while signed in as the allowed user, this returns your
// Google refresh token so you can paste it into GOOGLE_REFRESH_TOKEN (.env.local
// + Vercel). The MCP server uses that token for headless calendar/Gmail access.
// Safe to delete this route once the token is saved.
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json(
      { error: "Not signed in. Sign in to Leo first, then reload this URL." },
      { status: 401 },
    );
  }
  const allowed = process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org";
  if (token.email !== allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!token.refreshToken) {
    return NextResponse.json({
      error:
        "No refresh token in your session. Sign out and sign in again so Google issues an offline refresh token.",
    });
  }
  return NextResponse.json({
    refreshToken: token.refreshToken,
    next: "Set this as GOOGLE_REFRESH_TOKEN in .env.local and in Vercel (Production), redeploy, then delete this route.",
  });
}
