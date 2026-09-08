import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { classifyInbox } from "@/lib/mail-classify";
import { syncPartnerMail } from "@/lib/partner-mail-sync";
import { responseStoreConfigured } from "@/lib/partner-response-store";

export const maxDuration = 300;

// POST /api/mail/classify — sort the inbox into Leo buckets (uses the signed-in
// user's Gmail token).
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const result = responseStoreConfigured ? await syncPartnerMail(session.accessToken) : await classifyInbox(session.accessToken);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Classify error:", err);
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }
}
