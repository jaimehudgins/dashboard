import {
  crmSupabase,
  CrmContact,
  CrmPartner,
  isCrmConfigured,
} from "./crm-supabase";
import {
  DriveFile,
  DRIVE_FOLDER_MIME,
  driveFileIdsFromText,
  getDriveFile,
  isReadableDriveFile,
  listDriveFolderChildren,
  readDriveText,
  searchDrive,
  searchDriveFolders,
} from "./drive";
import { getThread, searchMessages } from "./gmail";
import {
  curriculumRepo,
  isGithubConfigured,
  readCurriculumFile,
  searchCurriculumRepo,
} from "./github";
import {
  meetingContext,
  meetingsForPartner,
  searchTranscripts,
} from "./granola-search";
import { recallMemories } from "./memory";
import { findPlatformKnowledge } from "./platform-knowledge";
import { isSlackConfigured, searchSlack } from "./slack";
import {
  WorkBrief,
  WorkResearchSource,
  WorkSource,
  workSourceKey,
} from "./workbench";

interface WorkTask {
  title: string;
  description?: string;
}

interface WorkProject {
  name?: string;
  description?: string;
  scratchpad?: string;
}

interface WorkArea {
  name?: string;
}

interface DriveAnchor {
  key: "curriculum" | "partner";
  name: string;
  folder: DriveFile;
}

interface PartnerResearchContext {
  partner: CrmPartner;
  contacts: CrmContact[];
  aliases: string[];
  emailAddresses: string[];
  emailDomains: string[];
}

const DRIVE_ANCHOR_CONFIG = [
  {
    key: "curriculum" as const,
    name: "Willow Curriculum 2.0",
    envId: process.env.GOOGLE_DRIVE_CURRICULUM_FOLDER_ID?.trim(),
  },
  {
    key: "partner" as const,
    name: "Partner Success",
    envId: process.env.GOOGLE_DRIVE_PARTNER_SUCCESS_FOLDER_ID?.trim(),
  },
];

const GENERIC_TERMS = new Set([
  "about",
  "after",
  "before",
  "build",
  "create",
  "decided",
  "deliverable",
  "design",
  "develop",
  "draft",
  "first",
  "from",
  "have",
  "include",
  "intended",
  "make",
  "major",
  "month",
  "need",
  "outline",
  "outcomes",
  "plan",
  "prepare",
  "questions",
  "school",
  "still",
  "task",
  "that",
  "the",
  "themes",
  "this",
  "with",
  "year",
]);

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 300)
    : "The source could not be searched.";
}

function diagnostic(
  type: WorkSource["type"],
  title: string,
  status: "no_match" | "unavailable" | "error",
  excerpt: string,
): WorkSource {
  return { type, title, status, excerpt };
}

export function meaningfulTerms(
  task: WorkTask,
  project?: WorkProject,
  area?: WorkArea,
  additionalContext?: string,
): string[] {
  const raw = `${task.title} ${task.description ?? ""} ${project?.name ?? ""} ${
    area?.name ?? ""
  } ${additionalContext ?? ""}`;
  const acronyms = raw.match(/\b[A-Z][A-Z0-9&-]{2,}\b/g) ?? [];
  const words = raw.toLowerCase().match(/[a-z0-9][a-z0-9'&-]{2,}/g) ?? [];
  return [
    ...new Set([
      ...acronyms.map((term) => term.toLowerCase()),
      ...words.filter((term) => !GENERIC_TERMS.has(term)),
    ]),
  ].slice(0, 8);
}

export async function directDriveSources(
  token: string,
  text: string,
): Promise<WorkSource[]> {
  const fileIds = driveFileIdsFromText(text).slice(0, 5);
  if (!fileIds.length) return [];

  const results = await Promise.allSettled(
    fileIds.map(async (fileId) => {
      const file = await getDriveFile(token, fileId);
      const readable = await readDriveText(token, file, 12_000);
      if (!readable) {
        return diagnostic(
          "drive",
          file.name,
          "unavailable",
          `${file.type} files cannot currently be converted into readable text.`,
        );
      }
      return {
        type: "drive" as const,
        title: readable.name,
        url: readable.webViewLink,
        excerpt: readable.text,
        modifiedAt: readable.modifiedTime,
        status: "used" as const,
      };
    }),
  );

  return results.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : diagnostic(
          "drive",
          `Shared Drive file ${index + 1}`,
          "error",
          errorMessage(result.reason),
        ),
  );
}

export function taskNeedsKnowledge(task: WorkTask): boolean {
  return /(analy|arc|brief|compare|curriculum|design|draft|framework|lesson|outline|plan|presentation|proposal|research|roadmap|strategy|timeline|write)/i.test(
    `${task.title} ${task.description ?? ""}`,
  );
}

const ORGANIZATION_WORDS = new Set([
  "academy",
  "community",
  "district",
  "public",
  "school",
  "schools",
  "the",
]);

const DRIVE_RANKING_STOP_WORDS = new Set([
  "create",
  "develop",
  "draft",
  "first",
  "from",
  "have",
  "include",
  "make",
  "need",
  "prepare",
  "that",
  "the",
  "this",
  "with",
]);

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9][a-z0-9'&-]{2,}/g) ?? [];
}

function normalizedPhrase(value: string): string {
  return words(value).join(" ");
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value?.trim() ?? "")
    .filter((value) => {
      const key = normalizedPhrase(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function resolvePartnerForResearch(
  searchable: string,
  terms: string[],
  allowTokenMatch: boolean,
): Promise<PartnerResearchContext | null> {
  if (!isCrmConfigured) return null;
  try {
    const { data, error } = await crmSupabase
      .from("partners")
      .select(
        "id, name, status, priority, relationship_health, renewal_status, last_contact_date, next_follow_up, proposal_deadline, city_state, district, willow_staff_lead, summary, pain_points, onboarding_step",
      )
      .order("name")
      .limit(500);
    if (error) throw error;
    const compactSearchable = normalized(searchable);
    const termSet = new Set(terms);
    const ranked = ((data ?? []) as CrmPartner[])
      .map((partner) => {
        const partnerWords = words(partner.name).filter(
          (word) => !ORGANIZATION_WORDS.has(word),
        );
        const fullMatch = compactSearchable.includes(normalized(partner.name));
        const tokenMatches = partnerWords.filter((word) => termSet.has(word));
        return {
          partner,
          score: fullMatch
            ? 100
            : allowTokenMatch
              ? tokenMatches.length * 20
              : 0,
        };
      })
      .filter((partner) => partner.score > 0)
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (!best || (ranked[1] && ranked[1].score === best.score)) return null;

    const { data: contactRows, error: contactError } = await crmSupabase
      .from("contacts")
      .select("id, partner_id, name, role, email, phone, is_primary_contact")
      .eq("partner_id", best.partner.id)
      .order("is_primary_contact", { ascending: false });
    if (contactError) throw contactError;
    const contacts = (contactRows ?? []) as CrmContact[];
    const emailAddresses = contacts
      .map((contact) => contact.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email));
    const emailDomains = [
      ...new Set(emailAddresses.map((email) => email.split("@")[1]).filter(Boolean)),
    ];
    const aliases = uniqueStrings([
      best.partner.name,
      best.partner.district ?? undefined,
      ...contacts.map((contact) => contact.name),
      ...emailDomains.map((domain) => domain.split(".")[0]),
    ]).slice(0, 12);

    return {
      partner: best.partner,
      contacts,
      aliases,
      emailAddresses,
      emailDomains,
    };
  } catch (error) {
    console.warn("Could not resolve TEMU partner research identity:", error);
    return null;
  }
}

function driveResearchQueries(input: {
  task: WorkTask;
  project?: WorkProject;
  area?: WorkArea;
  feedback?: string;
  terms: string[];
  partnerNames: string[];
}): string[] {
  const context = `${input.task.title}\n${input.task.description ?? ""}\n${
    input.project?.name ?? ""
  }\n${input.area?.name ?? ""}\n${input.feedback ?? ""}`;
  const acronymSignals = context.match(/\b[A-Z][A-Z0-9&-]{2,}\b/g) ?? [];
  const namedSignals =
    context.match(
      /\b[A-Z][A-Za-z0-9&'-]+(?:\s+(?:[A-Z][A-Za-z0-9&'-]+|of|the|and)){1,4}\b/g,
    ) ?? [];
  return uniqueStrings([
    ...input.partnerNames,
    input.project?.name,
    ...acronymSignals,
    ...namedSignals.filter(
      (signal) => !/^(Google Drive|Jaime|Leo Workbench)$/i.test(signal),
    ),
    ...input.terms,
  ]).slice(0, 7);
}

interface DriveCandidate {
  file: DriveFile;
  location?: string;
  folderMatch: boolean;
  searchMatch?: boolean;
}

async function resolveDriveAnchors(token: string): Promise<{
  anchors: DriveAnchor[];
  diagnostics: WorkSource[];
}> {
  const results = await Promise.allSettled(
    DRIVE_ANCHOR_CONFIG.map(async (config): Promise<DriveAnchor> => {
      if (config.envId) {
        const folder = await getDriveFile(token, config.envId);
        if (folder.mimeType !== DRIVE_FOLDER_MIME) {
          throw new Error(`${config.name} is not a Drive folder`);
        }
        return { key: config.key, name: config.name, folder };
      }
      const matches = await searchDriveFolders(token, config.name, 20);
      const exact = matches.find(
        (folder) =>
          folder.name.trim().toLowerCase() === config.name.toLowerCase(),
      );
      if (!exact) throw new Error(`${config.name} folder was not found`);
      return { key: config.key, name: config.name, folder: exact };
    }),
  );
  const anchors: DriveAnchor[] = [];
  const diagnostics: WorkSource[] = [];
  results.forEach((result, index) => {
    const config = DRIVE_ANCHOR_CONFIG[index];
    if (result.status === "fulfilled") {
      anchors.push(result.value);
      diagnostics.push({
        type: "drive",
        title: `Drive anchor · ${config.name}`,
        url: result.value.folder.webViewLink,
        excerpt: `Leo searched this folder and its relevant subfolders as an authoritative context location.`,
        status: "used",
      });
    } else {
      diagnostics.push(
        diagnostic(
          "drive",
          `Drive anchor · ${config.name}`,
          "unavailable",
          `${errorMessage(result.reason)} Add the folder ID to the matching Google Drive environment variable.`,
        ),
      );
    }
  });
  return { anchors, diagnostics };
}

function driveRelevance(
  candidate: DriveCandidate,
  queries: string[],
  terms: string[],
  content = "",
): number {
  const name = normalizedPhrase(candidate.file.name);
  const location = normalizedPhrase(candidate.location ?? "");
  const body = content.toLowerCase();
  let score = candidate.folderMatch ? 3 : 0;
  if (candidate.searchMatch) score += 14;

  queries.forEach((query) => {
    const phrase = normalizedPhrase(query);
    if (!phrase) return;
    if (name === phrase) score += 40;
    else if (name.includes(phrase)) score += 22;
    if (location.includes(phrase)) score += 24;
    if (phrase.includes(" ") && body.includes(phrase)) score += 8;
  });
  terms.forEach((term) => {
    const termPattern = new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (termPattern.test(candidate.file.name)) score += 15;
    if (termPattern.test(candidate.location ?? "")) score += 10;
    if (content) {
      const matches = content.match(new RegExp(termPattern.source, "gi"));
      score += Math.min(matches?.length ?? 0, 3);
    }
  });
  return score;
}

async function filesInRelevantFolders(
  token: string,
  queries: string[],
  terms: string[],
  anchors: DriveAnchor[],
): Promise<DriveCandidate[]> {
  const folderResults = await Promise.allSettled(
    queries.slice(0, 6).map((query) => searchDriveFolders(token, query, 50)),
  );
  const rankedFolders = folderResults
    .filter(
      (result): result is PromiseFulfilledResult<DriveFile[]> =>
        result.status === "fulfilled",
    )
    .flatMap((result) => result.value)
    .filter(
      (folder, index, all) =>
        all.findIndex((candidate) => candidate.id === folder.id) === index,
    )
    .map((folder) => {
      const candidate = { file: folder, folderMatch: true };
      return {
        candidate,
        score: driveRelevance(candidate, queries, terms),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score,
    );
  const bestFolderScore = rankedFolders[0]?.score ?? 0;
  const discoveredFolders = rankedFolders
    .filter((folder) => folder.score >= bestFolderScore - 12)
    .slice(0, 3);
  const anchorFolders = anchors.map((anchor) => ({
    candidate: {
      file: anchor.folder,
      location: anchor.name,
      folderMatch: true,
    },
    score: 1_000,
  }));
  const folders = [...anchorFolders, ...discoveredFolders].filter(
    (folder, index, all) =>
      all.findIndex(
        (candidate) => candidate.candidate.file.id === folder.candidate.file.id,
      ) === index,
  );

  const candidates: DriveCandidate[] = [];
  const visited = new Set<string>();
  let queue = folders.map((folder) => ({
    folder: folder.candidate.file,
    path: folder.candidate.file.name,
    depth: 0,
  }));
  while (queue.length && visited.size < 24 && candidates.length < 240) {
    const batch = queue
      .filter((current) => !visited.has(current.folder.id))
      .sort((left, right) => {
        const leftScore = driveRelevance(
          { file: left.folder, location: left.path, folderMatch: true },
          queries,
          terms,
        );
        const rightScore = driveRelevance(
          { file: right.folder, location: right.path, folderMatch: true },
          queries,
          terms,
        );
        return rightScore - leftScore;
      })
      .slice(0, Math.max(0, 24 - visited.size));
    queue = [];
    batch.forEach((current) => visited.add(current.folder.id));
    const childResults = await Promise.allSettled(
      batch.map((current) =>
        listDriveFolderChildren(token, current.folder.id, 100).then(
          (children) => ({ current, children }),
        ),
      ),
    );
    for (const result of childResults) {
      if (result.status !== "fulfilled") continue;
      const { current, children } = result.value;
      for (const child of children) {
        if (candidates.length >= 240) break;
        if (child.mimeType === DRIVE_FOLDER_MIME && current.depth < 3) {
          queue.push({
            folder: child,
            path: `${current.path} / ${child.name}`,
            depth: current.depth + 1,
          });
        } else if (isReadableDriveFile(child)) {
          candidates.push({
            file: child,
            location: current.path,
            folderMatch: true,
          });
        }
      }
    }
  }
  return candidates;
}

async function driveSources(
  token: string,
  queries: string[],
  terms: string[],
  entityNames: string[],
  anchors: DriveAnchor[],
): Promise<WorkSource[]> {
  if (!queries.length) {
    return [
      diagnostic("drive", "Google Drive", "no_match", "No useful search terms."),
    ];
  }
  try {
    const [searches, folderCandidates] = await Promise.all([
      Promise.allSettled(
        queries.slice(0, 7).map((query) => searchDrive(token, query, 20)),
      ),
      filesInRelevantFolders(
        token,
        entityNames.length ? entityNames : queries,
        terms,
        anchors,
      ),
    ]);
    const failures = searches.filter((result) => result.status === "rejected");
    const discovered: DriveCandidate[] = searches
      .filter(
        (result): result is PromiseFulfilledResult<DriveFile[]> =>
          result.status === "fulfilled",
      )
      .flatMap((result) => result.value)
      .filter(isReadableDriveFile)
      .map((file) => ({ file, folderMatch: false, searchMatch: true }));
    const candidatePool = folderCandidates.length
      ? [...folderCandidates, ...discovered]
      : discovered;
    const rankedCandidates = candidatePool
      .filter(
        (candidate, index, all) =>
          all.findIndex((item) => item.file.id === candidate.file.id) === index,
      )
      .map((candidate) => ({
        candidate,
        score: driveRelevance(candidate, queries, terms),
      }))
      .filter((candidate) => candidate.score >= 8)
      .sort(
        (left, right) =>
          right.score - left.score,
      );
    const bestCandidateScore = rankedCandidates[0]?.score ?? 0;
    const stronglyRanked = rankedCandidates.filter(
      (candidate) => candidate.score >= bestCandidateScore - 30,
    );
    const candidates = (stronglyRanked.length >= 4
      ? stronglyRanked
      : rankedCandidates
    ).slice(0, 8);
    const reads = await Promise.allSettled(
      candidates.map(async ({ candidate }) => ({
        candidate,
        readable: await readDriveText(token, candidate.file, 8_000),
      })),
    );
    const sources = reads
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          candidate: DriveCandidate;
          readable: NonNullable<Awaited<ReturnType<typeof readDriveText>>>;
        }> => result.status === "fulfilled" && Boolean(result.value.readable),
      )
      .map((result) => result.value)
      .sort(
        (left, right) =>
          driveRelevance(
            right.candidate,
            queries,
            terms,
            right.readable.text,
          ) -
          driveRelevance(
            left.candidate,
            queries,
            terms,
            left.readable.text,
          ),
      )
      .slice(0, 6)
      .map<WorkSource>((file) => ({
        type: "drive",
        title: file.readable.name,
        url: file.readable.webViewLink,
        excerpt: [
          file.candidate.location
            ? `Drive location: ${file.candidate.location}`
            : "",
          file.readable.text,
        ]
          .filter(Boolean)
          .join("\n\n"),
        modifiedAt: file.readable.modifiedTime,
        status: "used",
      }));
    if (sources.length) return sources;
    if (failures.length === searches.length) {
      const first = failures[0] as PromiseRejectedResult;
      return [
        diagnostic(
          "drive",
          "Google Drive",
          "error",
          errorMessage(first.reason),
        ),
      ];
    }
    return [
      diagnostic(
        "drive",
        "Google Drive",
        "no_match",
        `No readable files matched: ${queries.slice(0, 7).join(", ")}.`,
      ),
    ];
  } catch (error) {
    return [diagnostic("drive", "Google Drive", "error", errorMessage(error))];
  }
}

async function gmailSources(
  token: string,
  terms: string[],
  partnerContext?: PartnerResearchContext | null,
): Promise<WorkSource[]> {
  if (!terms.length && !partnerContext) return [];
  try {
    const identityClauses = partnerContext
      ? [
          ...partnerContext.emailAddresses
            .slice(0, 8)
            .flatMap((email) => [`from:${email}`, `to:${email}`]),
          `"${partnerContext.partner.name.replace(/"/g, "")}"`,
          ...partnerContext.emailDomains.slice(0, 2).map((domain) => `"${domain}"`),
        ]
      : terms
          .slice(0, 4)
          .map((term) => `"${term.replace(/"/g, "")}"`);
    const query = `newer_than:730d {${identityClauses.join(" ")}} -in:chats`;
    const messages = await searchMessages(token, query, 15);
    if (!messages.length) {
      return [
        diagnostic(
          "gmail",
          "Gmail",
          "no_match",
          partnerContext
            ? `No recent email matched the TEMU identity for ${partnerContext.partner.name}.`
            : `No recent email matched: ${terms.slice(0, 4).join(", ")}.`,
        ),
      ];
    }
    const uniqueThreads = messages
      .filter(
        (message, index, all) =>
          all.findIndex((candidate) => candidate.threadId === message.threadId) ===
          index,
      )
      .slice(0, 6);
    const reads = await Promise.allSettled(
      uniqueThreads.map(async (message) => ({
        message,
        thread: await getThread(token, message.threadId),
      })),
    );
    const sources = reads
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          message: (typeof uniqueThreads)[number];
          thread: Awaited<ReturnType<typeof getThread>>;
        }> => result.status === "fulfilled",
      )
      .map(({ value }) => ({
        type: "gmail" as const,
        title: value.message.subject || "Email without a subject",
        url: `https://mail.google.com/mail/u/0/#all/${value.message.threadId}`,
        excerpt: value.thread.messages
          .map(
            (threadMessage) =>
              `From: ${threadMessage.from}\nTo: ${threadMessage.to}${
                threadMessage.cc ? `\nCc: ${threadMessage.cc}` : ""
              }\nDate: ${threadMessage.date}\n${
                threadMessage.cleanBody || threadMessage.snippet
              }`,
          )
          .join("\n\n---\n\n")
          .slice(0, 8_000),
        status: "used" as const,
      }));
    return sources.length
      ? sources
      : [
          diagnostic(
            "gmail",
            "Gmail",
            "error",
            "Matching email was found, but Leo could not read its thread content.",
          ),
        ];
  } catch (error) {
    return [diagnostic("gmail", "Gmail", "error", errorMessage(error))];
  }
}

async function granolaSources(
  terms: string[],
  partnerContext?: PartnerResearchContext | null,
): Promise<WorkSource[]> {
  if (!terms.length && !partnerContext) return [];
  try {
    const [linkedMeetings, searchedMeetings] = await Promise.all([
      partnerContext
        ? meetingsForPartner(partnerContext.partner.id, 6)
        : Promise.resolve([]),
      searchTranscripts(
        [partnerContext?.partner.name, ...terms.slice(0, 5)]
          .filter(Boolean)
          .join(" "),
        undefined,
        6,
      ),
    ]);
    const meetings = [...linkedMeetings, ...searchedMeetings]
      .filter(
        (meeting, index, all) =>
          all.findIndex((candidate) => candidate.id === meeting.id) === index,
      )
      .slice(0, 6);
    if (!meetings.length) {
      return [
        diagnostic(
          "granola",
          "Granola",
          "no_match",
          partnerContext
            ? `No linked or matching meeting was found for ${partnerContext.partner.name}.`
            : `No meeting transcript matched: ${terms.slice(0, 5).join(", ")}.`,
        ),
      ];
    }
    const reads = await Promise.allSettled(
      meetings.map(async (meeting) => ({
        meeting,
        context: await meetingContext(
          meeting.id,
          [partnerContext?.partner.name, ...terms].filter(Boolean).join(" "),
          8_000,
        ),
      })),
    );
    const sources = reads
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          meeting: (typeof meetings)[number];
          context: string;
        }> => result.status === "fulfilled" && Boolean(result.value.context),
      )
      .map(({ value }) => ({
        type: "granola" as const,
        title: value.meeting.title,
        excerpt: value.context,
        status: "used" as const,
      }));
    return sources.length
      ? sources
      : [
          diagnostic(
            "granola",
            "Granola",
            "error",
            "A matching meeting was found, but its detailed context could not be read.",
          ),
        ];
  } catch (error) {
    return [diagnostic("granola", "Granola", "error", errorMessage(error))];
  }
}

async function memorySources(terms: string[]): Promise<WorkSource[]> {
  if (!terms.length) return [];
  try {
    const results = await Promise.allSettled(
      [
        recallMemories({
          entityType: "global",
          entityId: "workbench-preference",
          limit: 10,
        }),
        ...terms
          .slice(0, 4)
          .map((term) => recallMemories({ query: term, limit: 6 })),
      ],
    );
    const memories = results
      .filter(
        (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof recallMemories>>> =>
          result.status === "fulfilled",
      )
      .flatMap((result) => result.value)
      .filter(
        (memory, index, all) =>
          all.findIndex((candidate) => candidate.id === memory.id) === index,
      )
      .slice(0, 6);
    if (!memories.length) {
      return [
        diagnostic(
          "memory",
          "Leo memory",
          "no_match",
          `No durable memory matched: ${terms.slice(0, 4).join(", ")}.`,
        ),
      ];
    }
    return memories.map((memory) => ({
      type: "memory",
      title: `${memory.entity_type}: ${memory.entity_id || "general"}`,
      excerpt: memory.fact,
      status: "used",
    }));
  } catch (error) {
    return [diagnostic("memory", "Leo memory", "error", errorMessage(error))];
  }
}

async function curriculumSources(terms: string[]): Promise<WorkSource[]> {
  if (!isGithubConfigured) {
    return [
      diagnostic(
        "curriculum_repo",
        "Curriculum repository",
        "unavailable",
        "The curriculum repository connection is not configured.",
      ),
    ];
  }
  if (!terms.length) return [];
  try {
    const hits = await searchCurriculumRepo(terms.slice(0, 3).join(" "), 4);
    if (!hits.length) {
      return [
        diagnostic(
          "curriculum_repo",
          "Curriculum repository",
          "no_match",
          `No file matched: ${terms.slice(0, 3).join(", ")}.`,
        ),
      ];
    }
    const reads = await Promise.allSettled(
      hits.map(async (hit) => ({
        hit,
        file: await readCurriculumFile(hit.path, 12_000),
      })),
    );
    const sources = reads
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          hit: (typeof hits)[number];
          file: Awaited<ReturnType<typeof readCurriculumFile>>;
        }> => result.status === "fulfilled",
      )
      .map(({ value }) => ({
        type: "curriculum_repo" as const,
        title: value.hit.path,
        url: value.file.url || value.hit.url,
        excerpt: value.file.text,
        status: "used" as const,
      }));
    return sources.length
      ? sources
      : [
          diagnostic(
            "curriculum_repo",
            `Curriculum repository · ${curriculumRepo}`,
            "error",
            "Matching files were found, but their contents could not be read.",
          ),
        ];
  } catch (error) {
    return [
      diagnostic(
        "curriculum_repo",
        "Curriculum repository",
        "error",
        errorMessage(error),
      ),
    ];
  }
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function crmSources(
  partnerContext: PartnerResearchContext | null,
): Promise<WorkSource[]> {
  if (!isCrmConfigured) {
    return [
      diagnostic("crm", "TEMU CRM", "unavailable", "TEMU CRM is not configured."),
    ];
  }
  if (!partnerContext) {
    return [
      diagnostic(
        "crm",
        "TEMU CRM",
        "no_match",
        "Leo could not confidently match this task to one TEMU partner.",
      ),
    ];
  }
  try {
    const sources: WorkSource[] = [];
    for (const partner of [partnerContext.partner]) {
      const [
        { data: touchpoints, error: touchpointsError },
        { data: followUps, error: followUpsError },
        { data: importantDates, error: datesError },
      ] = await Promise.all([
        crmSupabase
          .from("touchpoints")
          .select("date, title, notes, next_steps, type")
          .eq("partner_id", partner.id)
          .order("date", { ascending: false })
          .limit(5),
        crmSupabase
          .from("follow_up_tasks")
          .select("task, due_date, status, notes")
          .eq("partner_id", partner.id)
          .eq("completed", false)
          .order("due_date", { ascending: true })
          .limit(6),
        crmSupabase
          .from("important_dates")
          .select("title, date, notes")
          .eq("partner_id", partner.id)
          .order("date", { ascending: true })
          .limit(10),
      ]);
      const relatedError =
        touchpointsError || followUpsError || datesError;
      if (relatedError) throw relatedError;
      sources.push({
        type: "crm",
        title: `Partner context · ${partner.name}`,
        excerpt: [
          `Resolved TEMU partner: ${partner.name} (${partner.id})`,
          partnerContext.aliases.length
            ? `Search identities: ${partnerContext.aliases.join("; ")}`
            : "",
          `Status: ${partner.status}`,
          partner.onboarding_step
            ? `Implementation: ${partner.onboarding_step}`
            : "",
          partner.relationship_health
            ? `Relationship health: ${partner.relationship_health}`
            : "",
          partner.summary ? `Summary: ${partner.summary}` : "",
          partner.pain_points?.length
            ? `Pain points: ${partner.pain_points.join("; ")}`
            : "",
          ...partnerContext.contacts.map(
            (contact) =>
              `Contact: ${contact.name}${contact.role ? ` · ${contact.role}` : ""}${
                contact.email ? ` · ${contact.email}` : ""
              }${contact.is_primary_contact ? " · primary" : ""}`,
          ),
          ...(touchpoints ?? []).map(
            (touchpoint) =>
              `${touchpoint.date} · ${touchpoint.type} · ${touchpoint.title || "Touchpoint"}\n${touchpoint.notes}${touchpoint.next_steps ? `\nNext: ${touchpoint.next_steps}` : ""}`,
          ),
          ...(followUps ?? []).map(
            (followUp) =>
              `Open follow-up: ${followUp.task}${followUp.due_date ? ` (due ${followUp.due_date})` : ""}`,
          ),
          ...(importantDates ?? []).map(
            (importantDate) =>
              `Important date: ${importantDate.date} · ${importantDate.title}${
                importantDate.notes ? ` · ${importantDate.notes}` : ""
              }`,
          ),
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 7000),
        status: "used",
      });
    }
    return sources;
  } catch (error) {
    return [diagnostic("crm", "TEMU CRM", "error", errorMessage(error))];
  }
}

async function slackSources(
  terms: string[],
  partnerContext?: PartnerResearchContext | null,
): Promise<WorkSource[]> {
  if (!isSlackConfigured) {
    return [
      diagnostic(
        "slack",
        "Slack",
        "unavailable",
        "Slack search is not connected yet.",
      ),
    ];
  }
  if (!terms.length && !partnerContext) return [];
  try {
    const queries = partnerContext
      ? uniqueStrings([
          partnerContext.partner.name,
          ...partnerContext.aliases.filter(
            (alias) => words(alias).some((word) => word.length >= 5),
          ),
        ]).slice(0, 3)
      : [terms.slice(0, 4).join(" ")];
    const results = await Promise.allSettled(
      queries.map((query) => searchSlack(`"${query.replace(/"/g, "")}"`, 8)),
    );
    const hits = results
      .filter(
        (result): result is PromiseFulfilledResult<
          Awaited<ReturnType<typeof searchSlack>>
        > => result.status === "fulfilled",
      )
      .flatMap((result) => result.value)
      .filter(
        (hit, index, all) =>
          all.findIndex((candidate) => candidate.permalink === hit.permalink) ===
          index,
      );
    if (results.every((result) => result.status === "rejected")) {
      const first = results[0] as PromiseRejectedResult;
      throw first.reason;
    }
    if (!hits.length) {
      return [
        diagnostic(
          "slack",
          "Slack",
          "no_match",
          partnerContext
            ? `No Slack message matched ${partnerContext.partner.name}.`
            : `No message matched: ${terms.slice(0, 4).join(", ")}.`,
        ),
      ];
    }
    return hits.slice(0, 6).map((hit) => ({
      type: "slack",
      title: `#${hit.channel || "Slack"} · ${hit.user || "Unknown"}`,
      url: hit.permalink,
      excerpt: hit.text,
      status: "used",
    }));
  } catch (error) {
    return [diagnostic("slack", "Slack", "error", errorMessage(error))];
  }
}

function platformSources(searchable: string): WorkSource[] {
  const matches = findPlatformKnowledge(searchable);
  if (!matches.length) {
    return [
      diagnostic(
        "platform",
        "Platform knowledge",
        "no_match",
        "No verified platform guidance matched this task. The deployed Workbench cannot run local Codex skills directly.",
      ),
    ];
  }
  return matches.map((source) => ({
    type: "platform",
    title: `${source.title} · verified ${source.verifiedAt}`,
    excerpt: `${source.content}\n\nVerification date: ${source.verifiedAt}. Treat navigation as uncertain if the product has changed since this date.`,
    status: "used",
  }));
}

export async function gatherWorkSources(input: {
  token: string;
  task: WorkTask;
  project?: WorkProject;
  area?: WorkArea;
  feedback?: string;
  brief?: WorkBrief;
}): Promise<WorkSource[]> {
  const sources: WorkSource[] = [
    {
      type: "task",
      title: input.task.title,
      excerpt: input.task.description?.trim() || "No task notes were provided.",
      status: "used",
    },
  ];
  if (input.project?.name) {
    sources.push({
      type: "project",
      title: input.project.name,
      excerpt: [input.project.description, input.project.scratchpad]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 4000),
      status: "used",
    });
  }
  if (input.brief) {
    sources.push({
      type: "brief",
      title: "Leo work brief",
      excerpt: [
        `Route: ${input.brief.route.replace("_", " ")}`,
        `Deliverable: ${input.brief.intendedDeliverable || "Not yet clear"}`,
        `Audience: ${input.brief.audience || "Not specified"}`,
        `Outcome: ${input.brief.outcome || "Not specified"}`,
        input.brief.constraints.length
          ? `Constraints: ${input.brief.constraints.join("; ")}`
          : "",
        input.brief.requiredSources.length
          ? `Required sources: ${input.brief.requiredSources.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      status: "used",
    });
  }
  if (
    !taskNeedsKnowledge(input.task) &&
    !(input.brief && input.brief.requiredSources.length > 0)
  ) {
    const checkedAt = new Date().toISOString();
    return sources.map((source) => ({ ...source, checkedAt }));
  }

  const terms = meaningfulTerms(
    input.task,
    input.project,
    input.area,
    [input.feedback, ...(input.brief?.searchTerms ?? [])]
      .filter(Boolean)
      .join(" "),
  );
  const searchable = `${input.task.title}\n${input.task.description ?? ""}\n${
    input.project?.name ?? ""
  }\n${input.feedback ?? ""}\n${input.brief?.searchTerms.join(" ") ?? ""}`;
  const partnerScoped =
    Boolean(input.brief?.requiredSources.includes("crm")) ||
    /partner|customer|consult/i.test(
      `${input.project?.name ?? ""} ${input.area?.name ?? ""}`,
    );
  const partnerContext = await resolvePartnerForResearch(
    searchable,
    terms,
    partnerScoped,
  );
  const partnerNames = partnerContext ? [partnerContext.partner.name] : [];
  const { anchors, diagnostics: anchorDiagnostics } =
    await resolveDriveAnchors(input.token);
  sources.push(...anchorDiagnostics);
  const driveRankingTerms = [
    ...new Set(
      words(
        `${input.task.title} ${input.task.description ?? ""} ${
          input.project?.name ?? ""
        } ${input.feedback ?? ""}`,
      ).filter((word) => !DRIVE_RANKING_STOP_WORDS.has(word)),
    ),
  ].slice(0, 16);
  const driveQueries = driveResearchQueries({
    task: input.task,
    project: input.project,
    area: input.area,
    feedback: input.feedback,
    terms,
    partnerNames,
  });
  const required = new Set<WorkResearchSource>(
    input.brief?.requiredSources ?? [],
  );
  const partnerPacketSources = new Set<WorkResearchSource>([
    "gmail",
    "granola",
    "crm",
    "slack",
  ]);
  const shouldUseSource = (source: WorkResearchSource) =>
    required.size === 0 ||
    required.has(source) ||
    source === "drive" ||
    (partnerContext !== null && partnerPacketSources.has(source));
  const providerResults = await Promise.all([
    shouldUseSource("crm")
      ? crmSources(partnerContext)
      : Promise.resolve([]),
    shouldUseSource("gmail")
      ? gmailSources(input.token, terms, partnerContext)
      : Promise.resolve([]),
    shouldUseSource("granola")
      ? granolaSources(terms, partnerContext)
      : Promise.resolve([]),
    driveSources(
      input.token,
      driveQueries,
      driveRankingTerms,
      partnerNames,
      anchors,
    ),
    shouldUseSource("slack")
      ? slackSources(terms, partnerContext)
      : Promise.resolve([]),
    shouldUseSource("curriculum_repo")
      ? curriculumSources(terms)
      : Promise.resolve([]),
    shouldUseSource("platform")
      ? Promise.resolve(platformSources(searchable))
      : Promise.resolve([]),
    memorySources(terms),
  ]);
  const checkedAt = new Date().toISOString();
  return [...sources, ...providerResults.flat()]
    .slice(0, 40)
    .map((source) => ({ ...source, checkedAt }));
}

export function missingRequiredSources(
  sources: WorkSource[],
  requiredSources: WorkResearchSource[],
): WorkResearchSource[] {
  return requiredSources.filter(
    (required) =>
      !sources.some(
        (source) =>
          source.type === required &&
          !source.title.startsWith("Drive anchor ·") &&
          (!source.status || source.status === "used") &&
          source.feedback !== "irrelevant" &&
          Boolean(source.excerpt?.trim()),
      ),
  );
}

export function substantiveSourceCount(sources: WorkSource[]): number {
  return sources.filter(
    (source) =>
      source.status !== "no_match" &&
      source.status !== "unavailable" &&
      source.status !== "error" &&
      source.type !== "task" &&
      source.type !== "brief" &&
      !source.title.startsWith("Drive anchor ·") &&
      source.type !== "feedback" &&
      source.feedback !== "irrelevant" &&
      Boolean(source.excerpt && source.excerpt.trim().length >= 80),
  ).length;
}

export function sourcesForWorkPrompt(sources: WorkSource[]): string {
  const available = sources.filter(
    (source) =>
      source.status !== "no_match" &&
      source.status !== "unavailable" &&
      source.status !== "error" &&
      !source.title.startsWith("Drive anchor ·") &&
      source.feedback !== "irrelevant",
  );
  const promptTypeOrder: WorkSource["type"][] = [
    "feedback",
    "task",
    "project",
    "brief",
    "crm",
    "drive",
    "gmail",
    "granola",
    "slack",
    "curriculum_repo",
    "platform",
    "memory",
  ];
  const firstByType = promptTypeOrder.flatMap((type) => {
    const matching = available.filter((source) => source.type === type);
    const preferred = matching.find((source) => source.feedback === "useful");
    return preferred ? [preferred] : matching.slice(0, 1);
  });
  const firstKeys = new Set(
    firstByType.map((source) => source.url || workSourceKey(source)),
  );
  const used = [
    ...firstByType,
    ...available
      .filter(
        (source) => !firstKeys.has(source.url || workSourceKey(source)),
      )
      .sort((left, right) =>
        Number(right.feedback === "useful") -
        Number(left.feedback === "useful"),
      ),
  ];
  const unavailable = sources.filter(
    (source) =>
      source.status === "no_match" ||
      source.status === "unavailable" ||
      source.status === "error" ||
      source.feedback === "irrelevant",
  );
  const context = used
    .map(
      (source, index) =>
        `--- Source ${index + 1}: ${source.title} (${source.type}) ---\n${
          source.excerpt?.slice(0, 5_000) ||
          "Link only; do not infer its contents."
        }`,
    )
    .join("\n\n");
  const researchTrail = unavailable.length
    ? `\n\nResearch limitations:\n${unavailable
        .map(
          (source) =>
            `- ${source.title}: ${source.feedback === "irrelevant" ? "marked irrelevant by Jaime" : source.status}. ${source.excerpt || ""}`,
        )
        .join("\n")}`
    : "";
  return `${context}${researchTrail}`.slice(0, 42_000);
}
