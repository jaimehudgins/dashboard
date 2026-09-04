// Minimal Google Drive v3 client over REST. Takes a Google access token (from
// the session or getGoogleAccessToken). Read-only (drive.readonly scope).

const BASE = "https://www.googleapis.com/drive/v3";

export interface DriveFile {
  id: string;
  name: string;
  type: string; // friendly label
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  owner?: string;
}

export interface DriveTextSource extends DriveFile {
  text: string;
}

interface DriveApiFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  owners?: { displayName?: string }[];
}

interface DriveFileListResponse {
  files?: DriveApiFile[];
}

const TYPE_LABELS: Record<string, string> = {
  "application/vnd.google-apps.document": "Doc",
  "application/vnd.google-apps.spreadsheet": "Sheet",
  "application/vnd.google-apps.presentation": "Slides",
  "application/vnd.google-apps.folder": "Folder",
  "application/vnd.google-apps.form": "Form",
  "application/pdf": "PDF",
};

function friendlyType(mimeType: string): string {
  if (TYPE_LABELS[mimeType]) return TYPE_LABELS[mimeType];
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.includes("wordprocessing")) return "Word";
  if (mimeType.includes("spreadsheet")) return "Excel";
  if (mimeType.includes("presentation")) return "PowerPoint";
  return mimeType.split("/").pop() || "File";
}

async function driveFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function driveTextFetch(token: string, path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Drive API ${res.status}`);
  }
  return res.text();
}

function mapFiles(data: DriveFileListResponse): DriveFile[] {
  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    type: friendlyType(f.mimeType || ""),
    mimeType: f.mimeType || "",
    modifiedTime: f.modifiedTime || "",
    webViewLink: f.webViewLink || `https://drive.google.com/open?id=${f.id}`,
    owner: f.owners?.[0]?.displayName,
  }));
}

const FIELDS =
  "files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))";

// Search Drive by file name + full-text content. Empty query → recent files.
export async function searchDrive(
  token: string,
  query: string,
  max = 25,
): Promise<DriveFile[]> {
  const q = query.trim().replace(/'/g, "\\'");
  const filter = q
    ? `(name contains '${q}' or fullText contains '${q}') and trashed = false`
    : `trashed = false`;
  const params = new URLSearchParams({
    q: filter,
    fields: FIELDS,
    orderBy: "modifiedTime desc",
    pageSize: String(Math.min(max, 50)),
    spaces: "drive",
    corpora: "user",
  });
  const data = await driveFetch<DriveFileListResponse>(token, `/files?${params}`);
  return mapFiles(data);
}

// Export readable Drive content for grounding. Unsupported binary formats are
// skipped rather than guessed at; the original file remains untouched.
export async function readDriveText(
  token: string,
  file: DriveFile,
  maxChars = 6000,
): Promise<DriveTextSource | null> {
  let path: string | null = null;

  if (file.mimeType === "application/vnd.google-apps.document") {
    path = `/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent("text/plain")}`;
  } else if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
    path = `/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent("text/csv")}`;
  } else if (file.mimeType === "application/vnd.google-apps.presentation") {
    path = `/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent("text/plain")}`;
  } else if (
    file.mimeType.startsWith("text/") ||
    file.mimeType === "application/json"
  ) {
    path = `/files/${encodeURIComponent(file.id)}?alt=media`;
  }

  if (!path) return null;

  try {
    const text = (await driveTextFetch(token, path)).trim();
    if (!text) return null;
    return { ...file, text: text.slice(0, maxChars) };
  } catch (error) {
    console.warn(`Could not read Drive file ${file.id}:`, error);
    return null;
  }
}
