import {
  crmSupabase,
  CrmContact,
  CrmFollowUpTask,
  CrmImportantDate,
  CrmPartner,
  CrmTouchpoint,
  isCrmConfigured,
} from "./crm-supabase";
import { GmailMessageSummary, searchMessages } from "./gmail";
import { meetingsForPartner, MeetingSummary } from "./granola-search";
import { MemoryRow, recallMemories } from "./memory";

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "outlook.com",
  "yahoo.com",
]);

const TOPIC_STOP_WORDS = new Set([
  "about",
  "could",
  "from",
  "have",
  "please",
  "question",
  "thanks",
  "that",
  "their",
  "this",
  "with",
  "would",
  "your",
]);

export interface PartnerContext {
  partner: CrmPartner;
  matchedContact: CrmContact | null;
  contacts: CrmContact[];
  recentTouchpoints: CrmTouchpoint[];
  openFollowUps: CrmFollowUpTask[];
  importantDates: CrmImportantDate[];
  recentMeetings: MeetingSummary[];
  memories: MemoryRow[];
  relevantEmails: GmailMessageSummary[];
  assembledAt: string;
}

function extractEmail(value: string): string | null {
  const bracketed = value.match(/<([^>]+)>/);
  const candidate = (bracketed?.[1] ?? value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

function emailDomain(email: string): string {
  return email.split("@")[1] ?? "";
}

export async function findPartnerForSender(
  sender: string,
): Promise<{ partner: CrmPartner; contact: CrmContact | null } | null> {
  if (!isCrmConfigured) return null;
  const email = extractEmail(sender);
  if (!email) return null;

  const { data: exactContacts, error: contactError } = await crmSupabase
    .from("contacts")
    .select("id, partner_id, name, role, email, phone, is_primary_contact")
    .ilike("email", email)
    .limit(2);
  if (contactError) throw contactError;

  let contact = (exactContacts?.[0] as CrmContact | undefined) ?? null;
  let partnerId = contact?.partner_id ?? null;

  if (!partnerId) {
    const domain = emailDomain(email);
    if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return null;
    const { data: contacts, error } = await crmSupabase
      .from("contacts")
      .select("id, partner_id, name, role, email, phone, is_primary_contact");
    if (error) throw error;
    const domainMatches = (contacts as CrmContact[] | null)?.filter(
      (candidate) => emailDomain(candidate.email.toLowerCase()) === domain,
    ) ?? [];
    const partnerIds = [...new Set(domainMatches.map((candidate) => candidate.partner_id))];
    if (partnerIds.length !== 1) return null;
    partnerId = partnerIds[0];
    contact = domainMatches.find(
      (candidate) => candidate.email.toLowerCase() === email,
    ) ?? null;
  }

  const { data: partner, error } = await crmSupabase
    .from("partners")
    .select(
      "id, name, status, priority, relationship_health, renewal_status, last_contact_date, next_follow_up, proposal_deadline, city_state, district, willow_staff_lead, summary, pain_points, onboarding_step",
    )
    .eq("id", partnerId)
    .maybeSingle();
  if (error) throw error;
  return partner ? { partner: partner as CrmPartner, contact } : null;
}

function topicTerms(topic: string): string[] {
  return [...new Set(topic.toLowerCase().match(/[a-z0-9']{4,}/g) ?? [])]
    .filter((term) => !TOPIC_STOP_WORDS.has(term))
    .slice(0, 12);
}

function relevantPastEmails(
  emails: GmailMessageSummary[],
  topic: string,
  currentThreadId: string,
): GmailMessageSummary[] {
  const terms = topicTerms(topic);
  return emails
    .filter((email) => email.threadId !== currentThreadId)
    .map((email) => ({
      email,
      score: terms.reduce(
        (total, term) =>
          total +
          (`${email.subject} ${email.snippet}`.toLowerCase().includes(term) ? 1 : 0),
        0,
      ),
    }))
    .filter(({ score }, index) => score > 0 || index < 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ email }) => email);
}

export async function getPartnerContextForEmail(input: {
  sender: string;
  token: string;
  currentThreadId: string;
  topic: string;
}): Promise<PartnerContext | null> {
  const match = await findPartnerForSender(input.sender);
  if (!match) return null;
  const partnerId = match.partner.id;
  const senderEmail = extractEmail(input.sender);
  const today = new Date().toISOString().slice(0, 10);

  const [
    contactsResult,
    touchpointsResult,
    followUpsResult,
    datesResult,
    recentMeetings,
    memoriesById,
    memoriesByName,
    emailHistory,
  ] = await Promise.all([
    crmSupabase
      .from("contacts")
      .select("id, partner_id, name, role, email, phone, is_primary_contact")
      .eq("partner_id", partnerId),
    crmSupabase
      .from("touchpoints")
      .select(
        "id, partner_id, date, author, title, notes, next_steps, next_steps_due_date, type",
      )
      .eq("partner_id", partnerId)
      .order("date", { ascending: false })
      .limit(8),
    crmSupabase
      .from("follow_up_tasks")
      .select(
        "id, touchpoint_id, partner_id, task, due_date, completed, status, notes, created_at, updated_at",
      )
      .eq("partner_id", partnerId)
      .eq("completed", false)
      .order("due_date", { ascending: true })
      .limit(10),
    crmSupabase
      .from("important_dates")
      .select("id, partner_id, title, date, notes")
      .eq("partner_id", partnerId)
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(10),
    meetingsForPartner(partnerId, 4).catch(() => []),
    recallMemories({ entityType: "partner", entityId: partnerId, limit: 10 }).catch(
      () => [],
    ),
    recallMemories({
      entityType: "partner",
      entityId: match.partner.name,
      limit: 10,
    }).catch(() => []),
    senderEmail
      ? searchMessages(
          input.token,
          `{from:${senderEmail} to:${senderEmail}} newer_than:365d -in:chats`,
          15,
        ).catch(() => [])
      : Promise.resolve([]),
  ]);

  for (const result of [
    contactsResult,
    touchpointsResult,
    followUpsResult,
    datesResult,
  ]) {
    if (result.error) throw result.error;
  }

  const memories = [...memoriesById, ...memoriesByName].filter(
    (memory, index, all) => all.findIndex((item) => item.id === memory.id) === index,
  );

  return {
    partner: match.partner,
    matchedContact: match.contact,
    contacts: (contactsResult.data ?? []) as CrmContact[],
    recentTouchpoints: (touchpointsResult.data ?? []) as CrmTouchpoint[],
    openFollowUps: (followUpsResult.data ?? []) as CrmFollowUpTask[],
    importantDates: (datesResult.data ?? []) as CrmImportantDate[],
    recentMeetings,
    memories,
    relevantEmails: relevantPastEmails(
      emailHistory,
      input.topic,
      input.currentThreadId,
    ),
    assembledAt: new Date().toISOString(),
  };
}
