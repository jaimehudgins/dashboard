export type DriveCommentStatus = "review" | "needs_response" | "no_action";

export interface DriveCommentReply {
  id: string;
  content?: string;
  action?: string;
  deleted?: boolean;
  modifiedTime?: string;
  author?: { displayName?: string; me?: boolean };
}

export interface DriveComment {
  id: string;
  content?: string;
  modifiedTime?: string;
  deleted?: boolean;
  resolved?: boolean;
  author?: { displayName?: string; me?: boolean };
  quotedFileContent?: { mimeType?: string; value?: string };
  replies?: DriveCommentReply[];
}

export interface ConnectedCommentFile {
  id: string;
  name: string;
}

export interface CommentCard extends DriveComment {
  revision: string;
  status: DriveCommentStatus;
  task: { id: string; title: string; status: string } | null;
  pendingWrite: boolean;
}

export interface CommentFileView {
  file: ConnectedCommentFile;
  canWrite: boolean;
  writeReason: string;
  comments: CommentCard[];
}

export interface DriveCommentSetup {
  files: ConnectedCommentFile[];
  pickerReady: boolean;
  permissionReady: boolean;
  enabled: boolean;
}
