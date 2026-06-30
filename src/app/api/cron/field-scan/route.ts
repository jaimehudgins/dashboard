import { NextResponse } from "next/server";
import { scanField } from "@/lib/field-scan";

export const maxDuration = 300;

// Daily field-intelligence scan. CRON_SECRET-guarded.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await scanField();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Cron field scan error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 },
    );
  }
}
