import { crmSupabase, CrmPartner, isCrmConfigured } from "./crm-supabase";
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
import { searchMessages } from "./gmail";
import {
  curriculumRepo,
  isGithubConfigured,
  searchCurriculumRepo,
} from "./github";
import { searchTranscripts } from "./granola-search";
import { recallMemories } from "./memory";
import { findPlatformKnowledge } from "./platform-knowledge";
import { isSlackConfigured, searchSlack } from "./slack";
import { WorkSource } from "./workbench";

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

async function partnerNamesForResearch(
  searchable: string,
  terms: string[],
): Promise<string[]> {
  if (!isCrmConfigured) return [];
  try {
    const { data, error } = await crmSupabase
      .from("partners")
      .select("name")
      .order("name")
      .limit(500);
    if (error) throw error;
    const compactSearchable = normalized(searchable);
    const termSet = new Set(terms);
    return ((data ?? []) as Array<{ name: string }>)
      .map((partner) => {
        const partnerWords = words(partner.name).filter(
          (word) => !ORGANIZATION_WORDS.has(word),
        );
        const fullMatch = compactSearchable.includes(normalized(partner.name));
        const tokenMatches = partnerWords.filter((word) => termSet.has(word));
        return {
          name: partner.name,
          score: fullMatch ? 100 : tokenMatches.length * 20,
        };
      })
      .filter((partner) => partner.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map((partner) => partner.name);
  } catch (error) {
    console.warn("Could not resolve Drive research entities:", error);
    return [];
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
}

function candidateMatchesEntities(
  candidate: DriveCandidate,
  entityNames: string[],
): boolean {
  if (!entityNames.length) return true;
  const haystack = `${candidate.file.name} ${candidate.location ?? ""}`;
  const haystackWords = new Set(words(haystack));
  return entityNames.some((entityName) => {
    const entityWords = words(entityName).filter(
      (word) => !ORGANIZATION_WORDS.has(word),
    );
    return (
      normalizedPhrase(haystack).includes(normalizedPhrase(entityName)) ||
      entityWords.some((word) => haystackWords.has(word))
    );
  });
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
  let score = candidate.folderMatch ? 20 : 0;

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
  const folders = rankedFolders
    .filter((folder) => folder.score >= bestFolderScore - 12)
    .slice(0, 3);

  const candidates: DriveCandidate[] = [];
  const visited = new Set<string>();
  let queue = folders.map((folder) => ({
    folder: folder.candidate.file,
    path: folder.candidate.file.name,
    depth: 0,
  }));
  while (queue.length && visited.size < 10 && candidates.length < 80) {
    const batch = queue
      .filter((current) => !visited.has(current.folder.id))
      .slice(0, Math.max(0, 10 - visited.size));
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
      .map((file) => ({ file, folderMatch: false }));
    const candidatePool = folderCandidates.length
      ? [
          ...folderCandidates,
          ...discovered.filter((candidate) =>
            candidateMatchesEntities(candidate, entityNames),
          ),
        ]
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
): Promise<WorkSource[]> {
  if (!terms.length) return [];
  try {
    const query = `newer_than:730d {${terms
      .slice(0, 4)
      .map((term) => `"${term.replace(/"/g, "")}"`)
      .join(" ")}} -in:chats`;
    const messages = await searchMessages(token, query, 8);
    if (!messages.length) {
      return [
        diagnostic(
          "gmail",
          "Gmail",
          "no_match",
          `No recent email matched: ${terms.slice(0, 4).join(", ")}.`,
        ),
      ];
    }
    return messages.slice(0, 4).map((message) => ({
      type: "gmail",
      title: message.subject || "Email without a subject",
      url: `https://mail.google.com/mail/u/0/#all/${message.threadId}`,
      excerpt: `${message.from}\n${message.date}\n${message.snippet}`,
      status: "used",
    }));
  } catch (error) {
    return [diagnostic("gmail", "Gmail", "error", errorMessage(error))];
  }
}

async function granolaSources(terms: string[]): Promise<WorkSource[]> {
  if (!terms.length) return [];
  try {
    const meetings = await searchTranscripts(terms.slice(0, 5).join(" "), undefined, 4);
    if (!meetings.length) {
      return [
        diagnostic(
          "granola",
          "Granola",
          "no_match",
          `No meeting transcript matched: ${terms.slice(0, 5).join(", ")}.`,
        ),
      ];
    }
    return meetings.map((meeting) => ({
      type: "granola",
      title: meeting.title,
      excerpt: [
        meeting.date ? `Meeting date: ${meeting.date}` : "",
        meeting.attendees.length
          ? `Attendees: ${meeting.attendees.join(", ")}`
          : "",
        ...meeting.excerpts,
      ]
        .filter(Boolean)
        .join("\n"),
      status: "used",
    }));
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
    return hits.map((hit) => ({
      type: "curriculum_repo",
      title: hit.path,
      url: hit.url,
      excerpt: `Matching file in ${curriculumRepo}. The file contents were not read.`,
      status: "used",
    }));
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

async function crmSources(searchable: string): Promise<WorkSource[]> {
  if (!isCrmConfigured) {
    return [
      diagnostic("crm", "TEMU CRM", "unavailable", "TEMU CRM is not configured."),
    ];
  }
  try {
    const { data: partnerRows, error } = await crmSupabase
      .from("partners")
      .select(
        "id, name, status, priority, relationship_health, renewal_status, last_contact_date, next_follow_up, proposal_deadline, city_state, district, willow_staff_lead, summary, pain_points, onboarding_step",
      )
      .order("name")
      .limit(500);
    if (error) throw error;
    const compactSearchable = normalized(searchable);
    const matches = ((partnerRows ?? []) as CrmPartner[])
      .filter((partner) => {
        const key = normalized(partner.name);
        return key.length >= 3 && compactSearchable.includes(key);
      })
      .slice(0, 3);
    if (!matches.length) return [];

    const sources: WorkSource[] = [];
    for (const partner of matches) {
      const [{ data: touchpoints }, { data: followUps }] = await Promise.all([
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
      ]);
      sources.push({
        type: "crm",
        title: `TEMU CRM · ${partner.name}`,
        excerpt: [
          `Status: ${partner.status}`,
          partner.onboarding_step
            ? `Implementation: ${partner.onboarding_step}`
            : "",
          partner.relationship_health
            ? `Relationship health: ${partner.relationship_health}`
            : "",
          partner.summary ? `Summary: ${partner.summary}` : "",
          ...(touchpoints ?? []).map(
            (touchpoint) =>
              `${touchpoint.date} · ${touchpoint.type} · ${touchpoint.title || "Touchpoint"}\n${touchpoint.notes}${touchpoint.next_steps ? `\nNext: ${touchpoint.next_steps}` : ""}`,
          ),
          ...(followUps ?? []).map(
            (followUp) =>
              `Open follow-up: ${followUp.task}${followUp.due_date ? ` (due ${followUp.due_date})` : ""}`,
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

async function slackSources(terms: string[]): Promise<WorkSource[]> {
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
  if (!terms.length) return [];
  try {
    const hits = await searchSlack(terms.slice(0, 4).join(" "), 8);
    if (!hits.length) {
      return [
        diagnostic(
          "slack",
          "Slack",
          "no_match",
          `No message matched: ${terms.slice(0, 4).join(", ")}.`,
        ),
      ];
    }
    return hits.slice(0, 4).map((hit) => ({
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
  return findPlatformKnowledge(searchable).map((source) => ({
    type: "platform",
    title: source.title,
    excerpt: source.content,
    status: "used",
  }));
}

export async function gatherWorkSources(input: {
  token: string;
  task: WorkTask;
  project?: WorkProject;
  area?: WorkArea;
  feedback?: string;
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
  if (!taskNeedsKnowledge(input.task)) return sources;

  const terms = meaningfulTerms(
    input.task,
    input.project,
    input.area,
    input.feedback,
  );
  const searchable = `${input.task.title}\n${input.task.description ?? ""}\n${
    input.project?.name ?? ""
  }\n${input.feedback ?? ""}`;
  const partnerNames = await partnerNamesForResearch(searchable, terms);
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
  const providerResults = await Promise.all([
    driveSources(
      input.token,
      driveQueries,
      driveRankingTerms,
      partnerNames,
    ),
    gmailSources(input.token, terms),
    granolaSources(terms),
    memorySources(terms),
    curriculumSources(terms),
    crmSources(searchable),
    slackSources(terms),
    Promise.resolve(platformSources(searchable)),
  ]);
  return [...sources, ...providerResults.flat()].slice(0, 32);
}

export function substantiveSourceCount(sources: WorkSource[]): number {
  return sources.filter(
    (source) =>
      source.status !== "no_match" &&
      source.status !== "unavailable" &&
      source.status !== "error" &&
      source.type !== "task" &&
      source.type !== "feedback" &&
      source.feedback !== "irrelevant" &&
      Boolean(source.excerpt && source.excerpt.trim().length >= 80),
  ).length;
}

export function sourcesForWorkPrompt(sources: WorkSource[]): string {
  const used = sources.filter(
    (source) =>
      source.status !== "no_match" &&
      source.status !== "unavailable" &&
      source.status !== "error" &&
      source.feedback !== "irrelevant",
  ).sort((a, b) => {
    if (a.type === "feedback") return -1;
    if (b.type === "feedback") return 1;
    if (a.feedback === "useful" && b.feedback !== "useful") return -1;
    if (b.feedback === "useful" && a.feedback !== "useful") return 1;
    return 0;
  });
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
          source.excerpt || "Link only; do not infer its contents."
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
