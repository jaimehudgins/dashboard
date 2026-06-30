import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { scanField } from "@/lib/field-scan";

export const maxDuration = 120;

// Manual field scan, gated by the logged-in session. Backs the "Scan now"
// button on the CJ page.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const result = await scanField();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Field scan error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 },
    );
  }
}
