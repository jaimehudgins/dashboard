import { NextResponse } from "next/server";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { automaticPreparationEnabled, runPartnerPreparation } from "@/lib/partner-response-preparation";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  if (!automaticPreparationEnabled) return NextResponse.json({ skipped: true, reason: "Automatic reply preparation is disabled." });
  try {
    return NextResponse.json(await runPartnerPreparation(await getGoogleAccessToken()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Partner preparation failed." }, { status: 503 });
  }
}
