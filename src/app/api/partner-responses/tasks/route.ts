import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getResponse } from "@/lib/partner-response-store";
import { getThread } from "@/lib/gmail";
import { createEmailTask, linkedEmailTasks } from "@/lib/attention-tasks";
import { emailTaskPreview } from "@/lib/email-task";

const id = z.string().regex(/^[a-zA-Z0-9-]{1,200}$/);
const inputSchema = z.object({
  threadId: id, messageId: id, confirmed: z.literal(true),
  title: z.string().trim().min(1).max(240), notes: z.string().max(12000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
    const parsed = new Date(`${date}T12:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
  }).nullable(),
  links: z.array(z.string().url().max(2048).refine((url) => /^https?:\/\//i.test(url))).max(50),
}).strict();
async function authorized() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === (process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org").toLowerCase() ? session : null;
}
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof z.ZodError || error instanceof SyntaxError ? "Check the task details and try again." : error instanceof Error ? error.message : "Task creation is unavailable." },
    { status: error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500 });
}
export async function GET(request: Request) {
  const session = await authorized();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const threadId = id.parse(params.get("threadId"));
    const item = await getResponse(threadId);
    if (!item) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const tasks = await linkedEmailTasks(threadId);
    if (params.get("preview") !== "1") return NextResponse.json({ tasks }, { headers: { "Cache-Control": "no-store" } });
    if (!session.accessToken || session.error) return NextResponse.json({ error: "Reconnect Gmail to read the source email." }, { status: 401 });
    const thread = await getThread(session.accessToken, threadId);
    return NextResponse.json({ tasks, preview: emailTaskPreview(item, thread.messages) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const session = await authorized();
  if (!session?.accessToken || session.error) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const input = inputSchema.parse(await request.json());
    if (!await getResponse(input.threadId)) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const thread = await getThread(session.accessToken, input.threadId);
    if (thread.messages.at(-1)?.id !== input.messageId) return NextResponse.json({ error: "A new email arrived. Your task text is retained; review the conversation and reopen task creation before saving." }, { status: 409 });
    return NextResponse.json(await createEmailTask(input));
  } catch (error) { return failure(error); }
}
