import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { COMMENT_SCOPE, CommentError, commentRevision, getCommentFile, getDriveComment, listDriveComments } from "@/lib/drive-comments";
import { connectedCommentFiles, connectCommentFile, requireCommentFile, decorateComments, decideComment, createCommentTask, confirmedCommentWrite } from "@/lib/drive-comment-store";

export const maxDuration = 60;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
const base = { fileId: id, commentId: id, revision: z.string().regex(/^[a-f0-9]{64}$/) };
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), fileId: id, confirmed: z.literal(true) }).strict(),
  z.object({ ...base, action: z.literal("triage"), status: z.enum(["review", "needs_response", "no_action"]) }).strict(),
  z.object({ ...base, action: z.literal("task"), confirmed: z.literal(true), title: z.string().trim().min(1).max(240), notes: z.string().max(12000) }).strict(),
  z.object({ ...base, action: z.literal("reply"), confirmed: z.literal(true), content: z.string().trim().min(1).max(10000) }).strict(),
  z.object({ ...base, action: z.literal("resolve"), confirmed: z.literal(true) }).strict(),
]);
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
async function authorized() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error || session.user?.email?.toLowerCase() !== (process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org").toLowerCase()) {
    throw new CommentError("Sign in to Leo again to connect Google Drive.", 401);
  }
  return session;
}
function fail(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "Check the details and try again." }, 400);
  if (error instanceof CommentError) return json({ error: error.message }, error.status);
  return json({ error: "Drive comments are unavailable. Check the service-role key and drive-comments.sql setup, or try refreshing. Your text has not been discarded." }, 503);
}
function permission(scope?: string) {
  return process.env.GOOGLE_DRIVE_COMMENTS_ENABLED === "true" && (scope ?? "").split(" ").includes(COMMENT_SCOPE);
}
export async function GET(request: Request) {
  try {
    const session = await authorized();
    const params = new URL(request.url).searchParams;
    const pickerReady = !!process.env.GOOGLE_PICKER_API_KEY && !!process.env.GOOGLE_CLOUD_PROJECT_NUMBER;
    if (params.get("picker") === "1") {
      if (!pickerReady || !permission(session.googleScope)) throw new CommentError("Finish Picker setup and sign in again to grant selected-file permission.", 409);
      return json({ accessToken: session.accessToken, apiKey: process.env.GOOGLE_PICKER_API_KEY, appId: process.env.GOOGLE_CLOUD_PROJECT_NUMBER });
    }
    if (!params.has("fileId")) return json({ files: await connectedCommentFiles(), pickerReady,
      permissionReady: permission(session.googleScope), enabled: process.env.GOOGLE_DRIVE_COMMENTS_ENABLED === "true" });
    const fileId = id.parse(params.get("fileId"));
    await requireCommentFile(fileId);
    const file = await getCommentFile(session.accessToken!, fileId);
    if (file.trashed) throw new CommentError("This file is in Drive trash.", 404);
    const canWrite = permission(session.googleScope) && !!file.isAppAuthorized && !!file.capabilities?.canComment;
    const comments = await decorateComments(fileId, await listDriveComments(session.accessToken!, fileId));
    return json({ file: { id: file.id, name: file.name }, canWrite, comments,
      writeReason: canWrite ? "" : "To reply or resolve, enable comments, sign in again, and select this file with Google Picker. You also need commenting permission in Drive." });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  try {
    // Cookie-authenticated external writes must originate in Leo, not another site.
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) throw new CommentError("Open this action from Leo.", 403);
    const session = await authorized();
    const input = inputSchema.parse(await request.json());
    if (input.action === "connect") {
      const file = await getCommentFile(session.accessToken!, input.fileId);
      if (file.trashed || file.mimeType === "application/vnd.google-apps.folder") throw new CommentError("Choose a file, not a folder or a trashed item.", 400);
      await connectCommentFile({ id: file.id, name: file.name });
      return json({ file: { id: file.id, name: file.name } });
    }
    const file = await requireCommentFile(input.fileId);
    if (input.action === "reply" || input.action === "resolve") {
      if (!permission(session.googleScope)) throw new CommentError("Replying and resolving require selected-file permission. Complete setup and sign in again.", 403);
      const currentFile = await getCommentFile(session.accessToken!, input.fileId);
      if (currentFile.trashed || !currentFile.isAppAuthorized || !currentFile.capabilities?.canComment) throw new CommentError("Select this file with Google Picker and check your Drive commenting permission.", 403);
    }
    const comment = await getDriveComment(session.accessToken!, input.fileId, input.commentId);
    if (comment.deleted || commentRevision(comment) !== input.revision) throw new CommentError("This comment changed. Refresh and review it; your text is retained.", 409);
    if (input.action === "triage") {
      await decideComment(input.fileId, comment, input.status);
      return json({ saved: true });
    }
    if (input.action === "task") return json(await createCommentTask(file, comment, input.title, input.notes));
    if (comment.resolved) throw new CommentError("This comment is already resolved. Refresh comments.", 409);
    return json(await confirmedCommentWrite(session.accessToken!, input.fileId, comment, input.action, input.action === "reply" ? input.content : undefined));
  } catch (error) { return fail(error); }
}
