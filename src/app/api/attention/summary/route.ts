import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Lightweight count for the global navigation. Source details continue to
// load only on Today and Attention.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { count, error } = await supabase
    .from("granola_extracted_tasks")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    console.error("Attention summary error:", error.message);
    return NextResponse.json(
      { error: "Failed to load attention summary" },
      { status: 500 },
    );
  }

  return NextResponse.json({ pendingReview: count ?? 0 });
}
