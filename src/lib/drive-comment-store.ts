import "server-only";
import { createHash } from "node:crypto";
import { responseDb } from "./partner-response-store";
import { CommentError, commentFileLink, commentRevision, commentTaskId, plainCommentQuote, writeDriveComment } from "./drive-comments";
import type { CommentCard, ConnectedCommentFile, DriveComment, DriveCommentStatus } from "@/types/drive-comments";

function check(error: { code?: string } | null) {
  if (error) throw new CommentError(error.code === "42P01" || error.code === "PGRST205"
    ? "Run drive-comments.sql in Leo’s Supabase to enable saved Drive comments."
    : "Leo could not save or read comment history. Nothing has been discarded.");
}

export async function connectedCommentFiles(): Promise<ConnectedCommentFile[]> {
  const result = await responseDb().from("leo_comment_files").select("id,name").order("name").limit(501);
  check(result.error);
  if ((result.data?.length ?? 0) > 500) throw new CommentError("Too many connected files to list safely.");
  return result.data ?? [];
}

export async function requireCommentFile(fileId: string) {
  const result = await responseDb().from("leo_comment_files").select("id,name").eq("id", fileId).maybeSingle();
  check(result.error);
  if (!result.data) throw new CommentError("Connect this file in Attention first.", 404);
  return result.data as ConnectedCommentFile;
}

export async function connectCommentFile(file: ConnectedCommentFile) {
  const result = await responseDb().from("leo_comment_files").upsert(file);
  check(result.error);
}

export async function decorateComments(fileId: string, comments: DriveComment[]): Promise<CommentCard[]> {
  if (!comments.length) return [];
  const db = responseDb();
  // Chunk explicit keys to avoid PostgREST row limits and long URLs.
  const output: CommentCard[] = [];
  for (let i = 0; i < comments.length; i += 40) {
    const batch = comments.slice(i, i + 40);
    const revisions = batch.map(commentRevision);
    const [decisions, writes, tasks] = await Promise.all([
      db.from("leo_comment_decisions").select("comment_id,revision,status").eq("file_id", fileId).in("revision", revisions),
      db.from("leo_comment_writes").select("comment_id,revision,reply_id").eq("file_id", fileId).in("revision", revisions),
      db.from("tasks").select("id,title,status").in("id", batch.map((comment) => commentTaskId(fileId, comment.id))),
    ]);
    check(decisions.error); check(writes.error); check(tasks.error);
    for (const comment of batch) {
      const revision = commentRevision(comment);
      const decision = decisions.data?.find((row) => row.comment_id === comment.id && row.revision === revision);
      output.push({ ...comment, revision, status: (decision?.status ?? "review") as DriveCommentStatus,
        task: tasks.data?.find((row) => row.id === commentTaskId(fileId, comment.id)) ?? null,
        pendingWrite: !!writes.data?.some((row) => row.comment_id === comment.id && row.revision === revision),
      });
    }
  }
  return output;
}

export async function decideComment(fileId: string, comment: DriveComment, status: DriveCommentStatus) {
  const result = await responseDb().from("leo_comment_decisions").upsert({
    file_id: fileId, comment_id: comment.id, revision: commentRevision(comment), status,
  });
  check(result.error);
}

export async function createCommentTask(file: ConnectedCommentFile, comment: DriveComment, title: string, notes: string) {
  const id = commentTaskId(file.id, comment.id);
  const db = responseDb();
  const result = await db.from("tasks").insert({
    id, title, description: `${notes}\n\nDrive file: ${file.name}\n${commentFileLink(file.id)}\nComment ID: ${comment.id}\nQuoted file text: ${plainCommentQuote(comment)}\n\n${comment.author?.displayName ?? "Author"}: ${comment.content ?? ""}\n${(comment.replies ?? []).filter((reply) => !reply.deleted).map((reply) => `${reply.author?.displayName ?? "Author"}: ${reply.content ?? reply.action ?? ""}`).join("\n")}`,
    link: commentFileLink(file.id), priority: "medium", status: "pending", project_id: null,
    area_id: null, due_date: null, focus_minutes: 0, created_at: new Date().toISOString(),
  }).select("id,title,status").single();
  if (result.error?.code === "23505") {
    const existing = await db.from("tasks").select("id,title,status").eq("id", id).single();
    check(existing.error);
    return { task: existing.data, existing: true };
  }
  check(result.error);
  return { task: result.data, existing: false };
}

export async function confirmedCommentWrite(token: string, fileId: string, comment: DriveComment, action: "reply" | "resolve", content?: string) {
  const db = responseDb();
  const key = { file_id: fileId, comment_id: comment.id, revision: commentRevision(comment) };
  const claim = await db.from("leo_comment_writes").insert({ ...key, action,
    payload_hash: createHash("sha256").update(JSON.stringify([action, content ?? ""])).digest("hex"),
  });
  if (claim.error?.code === "23505") throw new CommentError("A reply or resolution was already attempted for this version. Refresh comments and check Drive before doing anything again.", 409);
  check(claim.error);
  let reply;
  try {
    reply = await writeDriveComment(token, fileId, comment.id, action, content);
    if (!reply.id) throw new Error("Missing write receipt");
  } catch (error) {
    if (error instanceof CommentError && error.definitive) {
      // An explicit rejection is safe to retry after its cause is fixed.
      const release = await db.from("leo_comment_writes").delete().match(key);
      check(release.error);
      throw error;
    }
    // A timeout, 5xx or unparsable success could have written in Drive.
    throw new CommentError("Google’s write result is uncertain. Your text is retained. Open Drive to check; Leo will not automatically resend or resolve again.", 409);
  }
  const receipt = await db.from("leo_comment_writes").update({ reply_id: reply.id }).match(key);
  if (receipt.error) throw new CommentError("Google accepted the action, but Leo could not save its receipt. Refresh comments; do not resend.", 409);
  return { sent: true, replyId: reply.id };
}
