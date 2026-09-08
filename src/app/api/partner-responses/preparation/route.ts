import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { preparationStatus, runPartnerPreparation } from "@/lib/partner-response-preparation";

export const maxDuration = 300;
async function sessionForOwner() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === (process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org").toLowerCase() ? session : null;
}

export async function GET() {
  if (!await sessionForOwner()) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try { return NextResponse.json(await preparationStatus()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Preparation status unavailable." }, { status: 503 }); }
}

export async function POST() {
  const session = await sessionForOwner();
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") return NextResponse.json({ error: "Reconnect Google to prepare replies." }, { status: 401 });
  try { return NextResponse.json(await runPartnerPreparation(session.accessToken)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Preparation failed." }, { status: 503 }); }
}
