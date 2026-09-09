import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { responseDb } from "@/lib/partner-response-store";
import { responsePolicyStatus } from "@/lib/partner-response-policy";
import { approveReassessedClosure, reassessConversation } from "@/lib/response-reassessment";
import { reassessmentStatuses } from "@/types/response-reassessment";

export const maxDuration = 120;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
const scopeSchema = z.enum(["waiting", "open", "all"]);
const target = z.object({ threadId: id, version: z.number().int().positive(), runId: z.string().uuid() });
const inputSchema = z.discriminatedUnion("action", [
  target.extend({ action: z.literal("assess"), scope: scopeSchema.default("open") }).strict(),
  target.extend({ action: z.literal("approve"), messageId: id, confirmed: z.literal(true) }).strict(),
]);
async function authorized() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === (process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org").toLowerCase() && session.accessToken && session.error !== "RefreshAccessTokenError" ? session : null;
}
function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid reassessment request." }, { status: 400 });
  return NextResponse.json({ error: error instanceof Error ? error.message : "Reassessment failed. Reload before retrying." }, { status: 409 });
}

// Keyset pagination collects the selected scope before any assessment writes.
// This covers all pages, not just the 50 currently visible in Attention.
export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Reconnect your authorized Google account." }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const cursor = z.union([id, z.null()]).parse(params.get("cursor"));
    const scope = scopeSchema.parse(params.get("scope") ?? "open");
    let query = responseDb().from("partner_responses").select("thread_id, version").in("status", reassessmentStatuses(scope)).order("thread_id").limit(51);
    if (cursor) query = query.gt("thread_id", cursor);
    const { data, error } = await query;
    if (error) throw new Error("Could not load conversations in this scope. No batch has started.");
    const rows = data ?? [];
    return NextResponse.json({ items: rows.slice(0, 50).map((row) => ({ threadId: row.thread_id, version: row.version })), cursor: rows.length > 50 ? rows[49].thread_id : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const session = await authorized();
  if (!session?.accessToken) return NextResponse.json({ error: "Reconnect your authorized Google account." }, { status: 401 });
  try {
    const input = inputSchema.parse(await request.json());
    const policy = await responsePolicyStatus();
    if (!policy.ready || (input.action === "assess" && !("enabled" in policy && policy.enabled))) return NextResponse.json({ error: "Response assessment setup is incomplete. Check the policy migration and model configuration." }, { status: 503 });
    if (input.action === "approve") {
      await approveReassessedClosure(session.accessToken, input, input.runId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ result: await reassessConversation(session.accessToken, input, input.runId, input.scope) });
  } catch (error) { return failure(error); }
}
