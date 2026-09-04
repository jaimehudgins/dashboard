import { readDriveText, searchDrive } from "./drive";
import { PartnerContext, getPartnerContextForEmail } from "./partner-context";
import { findPlatformKnowledge } from "./platform-knowledge";

export interface ReplySource {
  id: string;
  kind: "crm" | "granola" | "memory" | "past_email" | "drive" | "platform";
  title: string;
  detail: string;
  url?: string;
  content: string;
}

interface ReplyThread {
  id: string;
  messages: {
    from: string;
    subject: string;
    body: string;
    snippet: string;
  }[];
}

function clip(text: string | null | undefined, max = 1600): string {
  return (text ?? "").trim().slice(0, max);
}

function partnerSources(context: PartnerContext): ReplySource[] {
  const { partner } = context;
  const crmLines = [
    `Partner: ${partner.name}`,
    `Status: ${partner.status}`,
    partner.onboarding_step ? `Implementation stage: ${partner.onboarding_step}` : "",
    partner.relationship_health
      ? `Relationship health: ${partner.relationship_health}`
      : "",
    partner.renewal_status ? `Renewal: ${partner.renewal_status}` : "",
    partner.last_contact_date ? `Last CRM contact: ${partner.last_contact_date}` : "",
    partner.next_follow_up ? `Next follow-up: ${partner.next_follow_up}` : "",
    partner.summary ? `Summary: ${clip(partner.summary, 2400)}` : "",
    partner.pain_points?.length
      ? `Pain points: ${partner.pain_points.join("; ")}`
      : "",
    context.contacts.length
      ? `Contacts: ${context.contacts
          .map((contact) => `${contact.name}${contact.role ? ` (${contact.role})` : ""}`)
          .join(", ")}`
      : "",
    context.openFollowUps.length
      ? `Open follow-ups:\n${context.openFollowUps
          .map(
            (task) =>
              `- ${task.task}${task.due_date ? ` (due ${task.due_date})` : ""}`,
          )
          .join("\n")}`
      : "",
    context.importantDates.length
      ? `Important dates:\n${context.importantDates
          .map((date) => `- ${date.title}: ${date.date}`)
          .join("\n")}`
      : "",
  ].filter(Boolean);

  const sources: ReplySource[] = [
    {
      id: `crm:${partner.id}`,
      kind: "crm",
      title: `TEMU CRM · ${partner.name}`,
      detail: `Live partner record · assembled ${context.assembledAt.slice(0, 10)}`,
      content: crmLines.join("\n"),
    },
  ];

  if (context.recentTouchpoints.length > 0) {
    sources.push({
      id: `crm-touchpoints:${partner.id}`,
      kind: "crm",
      title: `TEMU touchpoints · ${partner.name}`,
      detail: `${context.recentTouchpoints.length} recent interaction${context.recentTouchpoints.length === 1 ? "" : "s"}`,
      content: context.recentTouchpoints
        .map(
          (touchpoint) =>
            `${touchpoint.date} · ${touchpoint.type}${touchpoint.title ? ` · ${touchpoint.title}` : ""}\n${clip(touchpoint.notes)}${touchpoint.next_steps ? `\nNext steps: ${clip(touchpoint.next_steps, 800)}` : ""}`,
        )
        .join("\n\n"),
    });
  }

  if (context.recentMeetings.length > 0) {
    sources.push({
      id: `granola:${partner.id}`,
      kind: "granola",
      title: `Granola · ${partner.name}`,
      detail: `${context.recentMeetings.length} recent partner meeting${context.recentMeetings.length === 1 ? "" : "s"}`,
      content: context.recentMeetings
        .map(
          (meeting) =>
            `${meeting.date ?? "Undated"} · ${meeting.title}\n${clip(meeting.summary, 1200) || "No summary available."}`,
        )
        .join("\n\n"),
    });
  }

  if (context.memories.length > 0) {
    sources.push({
      id: `memory:${partner.id}`,
      kind: "memory",
      title: `Leo memory · ${partner.name}`,
      detail: `${context.memories.length} durable fact${context.memories.length === 1 ? "" : "s"}`,
      content: context.memories
        .map(
          (memory) =>
            `${memory.fact} (recorded ${memory.created_at.slice(0, 10)}, importance ${memory.importance}/10)`,
        )
        .join("\n"),
    });
  }

  for (const email of context.relevantEmails) {
    sources.push({
      id: `past-email:${email.id}`,
      kind: "past_email",
      title: `Past email · ${email.subject || "No subject"}`,
      detail: email.date || "Date unavailable",
      url: `https://mail.google.com/mail/u/0/#all/${email.threadId}`,
      content: `${email.subject}\n${email.snippet}`,
    });
  }

  return sources;
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

const DRIVE_CONTEXT_TERMS = [
  "agenda",
  "agreement",
  "contract",
  "curriculum",
  "deck",
  "deliverable",
  "document",
  "implementation",
  "milestone",
  "plan",
  "policy",
  "proposal",
  "resource",
  "schedule",
  "scope",
  "timeline",
  "training",
  "workshop",
];

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
  const partnerMessage = [...thread.messages]
    .reverse()
    .find((message) => !message.from.toLowerCase().includes("@willowed.org"));

  const context = partnerMessage
    ? await getPartnerContextForEmail({
        sender: partnerMessage.from,
        token,
        currentThreadId: thread.id,
        topic: searchable,
      }).catch((error) => {
        console.warn("Partner context gathering failed:", error);
        return null;
      })
    : null;

  const platformSources: ReplySource[] = findPlatformKnowledge(searchable).map(
    (source) => ({
      id: `platform:${source.id}`,
      kind: "platform",
      title: source.title,
      detail: `Willow platform guide · verified ${source.verifiedAt}`,
      content: source.content,
    }),
  );

  const shouldSearchDrive = DRIVE_CONTEXT_TERMS.some((term) =>
    searchable.toLowerCase().includes(term),
  );

  const files = new Map<string, Awaited<ReturnType<typeof searchDrive>>[number]>();
  const searches = shouldSearchDrive
    ? await Promise.allSettled(
        driveQueries(last.subject, last.body || last.snippet).map((query) =>
          searchDrive(token, query, 5),
        ),
      )
    : [];
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

  const allSources = [
    ...(context ? partnerSources(context) : []),
    ...driveSources,
    ...platformSources,
  ];
  return allSources.slice(0, 14);
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
