// Minimal Google Drive v3 client over REST. Takes a Google access token (from
// the session or getGoogleAccessToken). Read-only (drive.readonly scope).

import { Buffer } from "node:buffer";
import { strFromU8, unzipSync } from "fflate";

const BASE = "https://www.googleapis.com/drive/v3";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveFile {
  id: string;
  name: string;
  type: string; // friendly label
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  owner?: string;
  size?: number;
  parents?: string[];
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
  size?: string;
  parents?: string[];
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

async function driveBufferFetch(
  token: string,
  path: string,
  maxBytes = 15 * 1024 * 1024,
): Promise<Buffer> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Drive API ${res.status}`);
  }
  const declaredSize = Number(res.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new Error("Drive file is too large to read safely");
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new Error("Drive file is too large to read safely");
  }
  return buffer;
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
    size: f.size ? Number(f.size) : undefined,
    parents: f.parents,
  }));
}

const FIELDS =
  "files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName),size,parents)";

const FILE_FIELDS =
  "id,name,mimeType,modifiedTime,webViewLink,owners(displayName),size,parents";

export async function getDriveFile(
  token: string,
  fileId: string,
): Promise<DriveFile> {
  const data = await driveFetch<DriveApiFile>(
    token,
    `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}`,
  );
  return mapFiles({ files: [data] })[0];
}

export function driveFileIdsFromText(text: string): string[] {
  const urls = text.match(/https:\/\/(?:drive|docs)\.google\.com\/[^\s<>"']+/gi) ?? [];
  const ids = urls.flatMap((rawUrl) => {
    try {
      const url = new URL(rawUrl.replace(/[),.;!?]+$/, ""));
      const pathId = url.pathname.match(/\/d\/([A-Za-z0-9_-]{10,})/)?.[1];
      const queryId = url.searchParams.get("id");
      const fileId = pathId || queryId;
      return fileId && /^[A-Za-z0-9_-]{10,}$/.test(fileId) ? [fileId] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(ids.filter(Boolean))];
}

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

export async function searchDriveFolders(
  token: string,
  query: string,
  max = 20,
): Promise<DriveFile[]> {
  const q = query.trim().replace(/'/g, "\\'");
  if (!q) return [];
  const params = new URLSearchParams({
    q: `mimeType = '${DRIVE_FOLDER_MIME}' and name contains '${q}' and trashed = false`,
    fields: FIELDS,
    orderBy: "modifiedTime desc",
    pageSize: String(Math.min(max, 50)),
    spaces: "drive",
    corpora: "user",
  });
  const data = await driveFetch<DriveFileListResponse>(token, `/files?${params}`);
  return mapFiles(data);
}

export async function listDriveFolderChildren(
  token: string,
  folderId: string,
  max = 100,
): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
    fields: FIELDS,
    orderBy: "folder,name_natural",
    pageSize: String(Math.min(max, 100)),
    spaces: "drive",
    corpora: "user",
  });
  const data = await driveFetch<DriveFileListResponse>(token, `/files?${params}`);
  return mapFiles(data);
}

export function isReadableDriveFile(file: DriveFile): boolean {
  return (
    file.mimeType === "application/vnd.google-apps.document" ||
    file.mimeType === "application/vnd.google-apps.spreadsheet" ||
    file.mimeType === "application/vnd.google-apps.presentation" ||
    file.mimeType === "application/pdf" ||
    file.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.mimeType.startsWith("text/") ||
    file.mimeType === "application/json"
  );
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function cleanOfficeXml(xml: string, paragraphTag: "w:p" | "a:p"): string {
  return decodeXmlEntities(
    xml
      .replace(new RegExp(`</${paragraphTag}>`, "g"), "\n")
      .replace(/<(?:w:tab|w:br|a:br)[^>]*\/>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readOfficeText(buffer: Buffer, mimeType: string): string {
  const archive = unzipSync(new Uint8Array(buffer), {
    filter: (file) =>
      mimeType.includes("wordprocessingml")
        ? file.name === "word/document.xml"
        : /^ppt\/slides\/slide\d+\.xml$/.test(file.name),
  });
  if (mimeType.includes("wordprocessingml")) {
    const document = archive["word/document.xml"];
    return document ? cleanOfficeXml(strFromU8(document), "w:p") : "";
  }
  return Object.entries(archive)
    .sort(([left], [right]) => {
      const leftNumber = Number(left.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const rightNumber = Number(right.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return leftNumber - rightNumber;
    })
    .map(([name, content]) => {
      const slideNumber = name.match(/slide(\d+)\.xml$/)?.[1] ?? "";
      const text = cleanOfficeXml(strFromU8(content), "a:p");
      return text ? `Slide ${slideNumber}\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
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
  } else if (file.mimeType === "application/pdf") {
    let parser: InstanceType<(typeof import("pdf-parse"))["PDFParse"]> | null =
      null;
    try {
      const { PDFParse } = await import("pdf-parse");
      const buffer = await driveBufferFetch(
        token,
        `/files/${encodeURIComponent(file.id)}?alt=media`,
      );
      parser = new PDFParse({ data: new Uint8Array(buffer) });
      const parsed = await parser.getText({ first: 40 });
      const text = parsed.text.trim();
      if (!text) return null;
      return { ...file, text: text.slice(0, maxChars) };
    } catch (error) {
      console.warn(`Could not read Drive PDF ${file.id}:`, error);
      return null;
    } finally {
      await parser?.destroy();
    }
  } else if (
    file.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    try {
      const buffer = await driveBufferFetch(
        token,
        `/files/${encodeURIComponent(file.id)}?alt=media`,
      );
      const text = readOfficeText(buffer, file.mimeType);
      if (!text) return null;
      return { ...file, text: text.slice(0, maxChars) };
    } catch (error) {
      console.warn(`Could not read Drive Office file ${file.id}:`, error);
      return null;
    }
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
