import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getResponse, responseDb } from "@/lib/partner-response-store";

const base = z.object({ threadId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/), scope: z.enum(["global", "partner"]), emailType: z.enum(["meeting_acceptance", "calendar_invitation", "meeting_change", "acknowledgment", "platform_access", "curriculum_question"]) });
const approval = base.extend({ confirmed: z.literal(true), expectedVersion: z.number().int().positive().nullable(), decision: z.enum(["reply_needed", "action_only", "waiting", "no_reply", "judgment"]), guidance: z.string().trim().min(1).max(800) }).strict();
const disable = base.extend({ expectedVersion: z.number().int().positive(), confirmed: z.literal(true) }).strict();
async function authorized() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === (process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org").toLowerCase() ? session : null;
}
function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid rule details. Approval is required." }, { status: 400 });
  return NextResponse.json({ error: "Could not access reusable rules. Check setup and refresh rules before trying again." }, { status: 503 });
}
export async function GET(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const threadId = base.shape.threadId.parse(new URL(request.url).searchParams.get("threadId"));
    const item = await getResponse(threadId);
    if (!item) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const db = responseDb();
    const [global, partner] = await Promise.all([
      db.from("partner_response_rules").select("*").is("partner_id", null),
      item.partner_id ? db.from("partner_response_rules").select("*").eq("partner_id", item.partner_id) : Promise.resolve({ data: [], error: null }),
    ]);
    const error = global.error || partner.error;
    if (error) {
      if (["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code)) return NextResponse.json({ ready: false, rules: [], error: "Run partner-response-rules.sql in Leo's Supabase to enable reusable rules." });
      throw error;
    }
    return NextResponse.json({ ready: true, rules: [...(global.data ?? []), ...(partner.data ?? [])] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
async function write(request: Request, deactivate: boolean) {
  const session = await authorized();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const raw = await request.json();
    const approved = deactivate ? null : approval.parse(raw);
    const input = approved ?? disable.parse(raw);
    const item = await getResponse(input.threadId);
    if (!item) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    if (input.scope === "partner" && !item.partner_id) return NextResponse.json({ error: "Match this conversation to a partner before approving a partner exception." }, { status: 400 });
    const partnerId = input.scope === "global" ? null : item.partner_id;
    const id = `${partnerId ?? "global"}:${input.emailType}`;
    const db = responseDb();
    const patch = approved ? { active: true, guidance: approved.guidance, decision: approved.decision, approved_by: session.user!.email!, approved_at: new Date().toISOString() } : { active: false };
    const result = input.expectedVersion === null
      ? await db.from("partner_response_rules").insert({ id, email_type: input.emailType, partner_id: partnerId, ...patch }).select("*").single()
      : await db.from("partner_response_rules").update(patch).eq("id", id).eq("version", input.expectedVersion).select("*").maybeSingle();
    if (result.error?.code === "23505" || (!result.error && !result.data)) return NextResponse.json({ error: "This rule changed. Refresh rules and review it again before approving." }, { status: 409 });
    if (result.error) throw result.error;
    return NextResponse.json({ rule: result.data });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) { return write(request, false); }
export async function PATCH(request: Request) { return write(request, true); }
