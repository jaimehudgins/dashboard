import "server-only";
import { createHash } from "node:crypto";
import type { DriveComment, DriveCommentReply } from "@/types/drive-comments";

const BASE = "https://www.googleapis.com/drive/v3";
export const COMMENT_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FIELDS = "id,content,modifiedTime,resolved,deleted,author(displayName,me),quotedFileContent,replies(id,content,action,deleted,modifiedTime,author(displayName,me))";

export class CommentError extends Error {
  constructor(message: string, public status = 500, public definitive = false) {
    super(message);
  }
}

async function request<T>(token: string, path: string, body?: object): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    // Do not expose Google response bodies, tokens, or private file details.
    throw new CommentError(response.status === 403
      ? "Google denied access. Check your file permission and reconnect this file with Google Picker."
      : response.status === 401 ? "Reconnect Google in Leo, then try again."
      : response.status === 404 ? "This file or comment is no longer available to Leo."
      : `Google Drive request failed (${response.status}).`, response.status,
    response.status >= 400 && response.status < 500 && response.status !== 408);
  }
  return await response.json() as T;
}

export function commentRevision(comment: DriveComment): string {
  // Include content and reply IDs, not only timestamps: edits and resolutions matter.
  return createHash("sha256").update(JSON.stringify([
    comment.id, comment.content ?? "", comment.modifiedTime ?? "", !!comment.resolved, !!comment.deleted,
    comment.quotedFileContent ?? null,
    (comment.replies ?? []).map((reply) => [reply.id, reply.content ?? "", reply.modifiedTime ?? "", reply.action ?? "", !!reply.deleted]),
  ])).digest("hex");
}

export function commentTaskId(fileId: string, commentId: string): string {
  const hex = createHash("sha256").update(`drive-comment-task:${fileId}:${commentId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function commentFileLink(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

export function plainCommentQuote(comment: DriveComment): string {
  const quote = comment.quotedFileContent;
  // Never render remote HTML or infer cell coordinates from opaque Drive anchors.
  return quote?.mimeType === "text/html"
    ? (quote.value ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    : quote?.value ?? "";
}

export async function getCommentFile(token: string, fileId: string) {
  return request<{ id: string; name: string; mimeType: string; trashed?: boolean; isAppAuthorized?: boolean; capabilities?: { canComment?: boolean } }>(
    token, `/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,trashed,isAppAuthorized,capabilities(canComment)`,
  );
}

export async function listDriveComments(token: string, fileId: string): Promise<DriveComment[]> {
  const comments: DriveComment[] = [];
  let next = "";
  const seen = new Set<string>();
  do {
    const params = new URLSearchParams({ fields: `nextPageToken,comments(${FIELDS})`, pageSize: "100", includeDeleted: "false" });
    if (next) params.set("pageToken", next);
    const page = await request<{ comments?: DriveComment[]; nextPageToken?: string }>(token, `/files/${encodeURIComponent(fileId)}/comments?${params}`);
    comments.push(...(page.comments ?? []));
    next = page.nextPageToken ?? "";
    if (next && (seen.has(next) || comments.length >= 2000)) throw new CommentError("This file has too many comments to load completely. Open it in Drive; Leo has not hidden any notification emails.");
    seen.add(next);
  } while (next);
  return comments.filter((comment) => !comment.deleted);
}

export async function getDriveComment(token: string, fileId: string, commentId: string) {
  return request<DriveComment>(token, `/files/${encodeURIComponent(fileId)}/comments/${encodeURIComponent(commentId)}?fields=${encodeURIComponent(FIELDS)}`);
}

export async function writeDriveComment(token: string, fileId: string, commentId: string, action: "reply" | "resolve", content?: string) {
  return request<DriveCommentReply>(token, `/files/${encodeURIComponent(fileId)}/comments/${encodeURIComponent(commentId)}/replies?fields=id,content,action`,
    action === "resolve" ? { action: "resolve" } : { content });
}
