import { readDriveText, searchDrive } from "./drive";
import { findPlatformKnowledge } from "./platform-knowledge";

export interface ReplySource {
  id: string;
  kind: "drive" | "platform";
  title: string;
  detail: string;
  url?: string;
  content: string;
}

interface ReplyThread {
  messages: {
    subject: string;
    body: string;
    snippet: string;
  }[];
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "could",
  "from",
  "have",
  "hello",
  "here",
  "just",
  "need",
  "please",
  "question",
  "regarding",
  "thanks",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "will",
  "with",
  "would",
  "your",
]);

function driveQueries(subject: string, body: string): string[] {
  const cleanSubject = subject.replace(/^\s*(re|fw|fwd):\s*/i, "").trim();
  const words = `${cleanSubject} ${body.slice(0, 1500)}`
    .toLowerCase()
    .match(/[a-z0-9']{4,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([word]) => word);
  const queries = [cleanSubject, ...ranked].filter(
    (query) => query.length >= 4 && query.length <= 80,
  );
  return [...new Set(queries)].slice(0, 4);
}

export async function gatherReplySources(
  token: string,
  thread: ReplyThread,
): Promise<ReplySource[]> {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return [];
  const searchable = `${last.subject}\n${last.body || last.snippet}`;

  const platformSources: ReplySource[] = findPlatformKnowledge(searchable).map(
    (source) => ({
      id: `platform:${source.id}`,
      kind: "platform",
      title: source.title,
      detail: `Willow platform guide · verified ${source.verifiedAt}`,
      content: source.content,
    }),
  );

  const files = new Map<string, Awaited<ReturnType<typeof searchDrive>>[number]>();
  const searches = await Promise.allSettled(
    driveQueries(last.subject, last.body || last.snippet).map((query) =>
      searchDrive(token, query, 5),
    ),
  );
  for (const result of searches) {
    if (result.status !== "fulfilled") continue;
    for (const file of result.value) {
      if (!files.has(file.id)) files.set(file.id, file);
      if (files.size >= 6) break;
    }
  }

  const readable = await Promise.all(
    [...files.values()].slice(0, 6).map((file) => readDriveText(token, file, 4500)),
  );
  const driveSources: ReplySource[] = readable
    .filter((file): file is NonNullable<typeof file> => !!file)
    .slice(0, 4)
    .map((file) => ({
      id: `drive:${file.id}`,
      kind: "drive",
      title: file.name,
      detail: `${file.type} · modified ${file.modifiedTime.slice(0, 10)}`,
      url: file.webViewLink,
      content: file.text,
    }));

  return [...platformSources, ...driveSources];
}

export function sourcesForPrompt(sources: ReplySource[]): string {
  if (sources.length === 0) {
    return "No additional sources were found. Do not infer missing facts.";
  }
  return sources
    .map(
      (source, index) =>
        `--- Source ${index + 1}: ${source.title} (${source.detail}) ---\n${source.content}`,
    )
    .join("\n\n");
}

export function publicReplySources(
  sources: ReplySource[],
): Omit<ReplySource, "content">[] {
  return sources.map((source) => ({
    id: source.id,
    kind: source.kind,
    title: source.title,
    detail: source.detail,
    url: source.url,
  }));
}
