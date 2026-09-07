import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";
import { crmSupabase, isCrmConfigured } from "@/lib/crm-supabase";
import {
  ensureLeoLabels,
  fetchInboxForClassify,
  modifyThreadLabels,
} from "@/lib/gmail";
import { emailDomain, isNotificationMail, LeoBucket } from "@/lib/mail-views";
import {
  classifyUrgencyDetailed,
  fetchUrgencyRecords,
  saveUrgencyDecisions,
  UrgencyDecision,
} from "@/lib/mail-urgency";

const NEWSLETTER_CATEGORIES = [
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
];

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "outlook.com",
  "yahoo.com",
]);

function isWillowDomain(domain: string): boolean {
  return domain === "willowed.org" || domain.endsWith(".willowed.org");
}

const ASSIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          domain: { type: "string" },
          bucket: { type: "string", enum: ["current", "potential", "other"] },
        },
        required: ["domain", "bucket"],
      },
    },
  },
  required: ["assignments"],
};

// Classify unlabeled inbox threads into Leo buckets and apply Gmail labels.
// Takes any Gmail access token (session-based from the UI, or the headless
// refresh-token-based one from cron).
export interface UrgentPartnerThread {
  id: string;
  lastMessageId: string;
  from: string;
  subject: string;
  date: string;
  reason: string;
  confidence: "high" | "medium";
}

export async function classifyInbox(token: string): Promise<{
  classified: number;
  applied: Record<string, number>;
  urgentPartnerThreads: UrgentPartnerThread[];
}> {
  const leo = await ensureLeoLabels(token);
  const leoIds = new Set(Object.values(leo));
  const threads = await fetchInboxForClassify(token, 100);

  const needsClassification = threads.filter((thread) => {
    const assignedLeoLabels = thread.labelIds.filter((id) => leoIds.has(id));
    if (assignedLeoLabels.length === 0) return true;
    const hasExternalParticipant = thread.participants.some(
      (participant) => !isWillowDomain(emailDomain(participant)),
    );
    return assignedLeoLabels.includes(leo.willow) && hasExternalParticipant;
  });

  const decided: { id: string; bucket: LeoBucket | "other" }[] = [];
  const partnerCandidates: {
    id: string;
    from: string;
    domains: string[];
    participants: string[];
  }[] = [];

  for (const t of needsClassification) {
    const externalDomains = [
      ...new Set(
        t.participants
          .map(emailDomain)
          .filter((domain) => domain && !isWillowDomain(domain)),
      ),
    ];
    if (isNotificationMail(t.from, t.subject)) {
      decided.push({ id: t.id, bucket: "notifications" });
    } else if (externalDomains.length === 0) {
      decided.push({ id: t.id, bucket: "willow" });
    } else if (
      t.listUnsub ||
      t.labelIds.some((l) => NEWSLETTER_CATEGORIES.includes(l))
    ) {
      decided.push({ id: t.id, bucket: "newsletter" });
    } else {
      partnerCandidates.push({
        id: t.id,
        from: t.from,
        domains: externalDomains,
        participants: t.participants,
      });
    }
  }

  if (partnerCandidates.length > 0 && isCrmConfigured) {
    const [{ data: partners }, { data: contacts }] = await Promise.all([
      crmSupabase.from("partners").select("id, name, status"),
      crmSupabase.from("contacts").select("email, partner_id"),
    ]);
    const partnerById = new Map(
      (partners || []).map((partner) => [
        partner.id as string,
        {
          name: partner.name as string,
          bucket: /^(active|onboarding)$/i.test(partner.status || "")
            ? ("current" as const)
            : ("potential" as const),
        },
      ]),
    );
    const emailBuckets = new Map<string, "current" | "potential">();
    const domainBuckets = new Map<string, Set<"current" | "potential">>();
    for (const contact of contacts || []) {
      const partner = partnerById.get(contact.partner_id as string);
      const email = String(contact.email || "").trim().toLowerCase();
      const domain = emailDomain(email);
      if (!partner || !email) continue;
      emailBuckets.set(email, partner.bucket);
      if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) {
        const buckets = domainBuckets.get(domain) || new Set();
        buckets.add(partner.bucket);
        domainBuckets.set(domain, buckets);
      }
    }
    const partnerList = (partners || [])
      .map((p) => `- ${p.name} (status: ${p.status || "unknown"})`)
      .join("\n");
    const unresolvedDomains = Array.from(
      new Map(
        partnerCandidates.flatMap((candidate) =>
          candidate.domains
            .filter((domain) => !domainBuckets.has(domain))
            .map((domain) => [domain, candidate.from]),
        ),
      ).entries(),
    ).map(([domain, from]) => `${domain} (e.g. ${from})`);

    const system = `You sort email senders into buckets for a Willow team member. Willow's CRM partners:\n${partnerList}\n\nFor each sender domain, decide: "current" if it belongs to a partner whose status is Active or Onboarding; "potential" if it belongs to a partner with any other status (New Lead, Contacted, Proposal Sent, etc.); "other" if it isn't one of these partners. Match by organization name/domain. When unsure, use "other".`;

    let map: Record<string, "current" | "potential" | "other"> = {};
    if (isAnthropicConfigured && unresolvedDomains.length > 0) {
      try {
        const resp = await anthropic.messages.create({
          model: "claude-opus-4-8",
          max_tokens: 1024,
          system,
          output_config: {
            format: { type: "json_schema", schema: ASSIGN_SCHEMA },
          },
          messages: [
            {
              role: "user",
              content: `Sender domains:\n${unresolvedDomains.join("\n")}`,
            },
          ],
        } as Anthropic.MessageCreateParamsNonStreaming);
        const text = resp.content.find((b) => b.type === "text");
        const parsed = JSON.parse(text && "text" in text ? text.text : "{}");
        for (const assignment of parsed.assignments || []) {
          map[assignment.domain] = assignment.bucket;
        }
      } catch (err) {
        console.warn("Classify model error:", err);
        map = {};
      }
    }

    for (const c of partnerCandidates) {
      const knownBuckets = [
        ...c.participants
          .map((email) => emailBuckets.get(email.toLowerCase()))
          .filter((bucket): bucket is "current" | "potential" => Boolean(bucket)),
        ...c.domains.flatMap((domain) => [
          ...(domainBuckets.get(domain) || []),
          map[domain] || "other",
        ]),
      ];
      const bucket = knownBuckets.includes("current")
        ? "current"
        : knownBuckets.includes("potential")
          ? "potential"
          : "other";
      decided.push({
        id: c.id,
        bucket: bucket === "other" ? "other" : (bucket as LeoBucket),
      });
    }
  } else {
    for (const c of partnerCandidates) {
      decided.push({ id: c.id, bucket: "other" });
    }
  }

  const applied: Record<string, number> = {};
  const bucketByThread = new Map<string, LeoBucket | "other">();
  for (const thread of threads) {
    const existingBucket = (Object.entries(leo) as [LeoBucket, string][]).find(
      ([, labelId]) => thread.labelIds.includes(labelId),
    )?.[0];
    if (existingBucket) bucketByThread.set(thread.id, existingBucket);
  }
  for (const d of decided) {
    bucketByThread.set(d.id, d.bucket);
    const thread = threads.find((candidate) => candidate.id === d.id);
    const oldLeoLabels = thread?.labelIds.filter((id) => leoIds.has(id)) ?? [];
    const nextLabel = d.bucket === "other" ? null : leo[d.bucket];
    if (
      oldLeoLabels.length === (nextLabel ? 1 : 0) &&
      (!nextLabel || oldLeoLabels[0] === nextLabel)
    ) {
      continue;
    }
    await modifyThreadLabels(
      token,
      d.id,
      nextLabel ? [nextLabel] : [],
      oldLeoLabels.filter((labelId) => labelId !== nextLabel),
    );
    applied[d.bucket] = (applied[d.bucket] || 0) + 1;
  }

  // Urgency (🔥 / ❓ / 🕒): backfill any inbox thread without a stored value.
  const existing = await fetchUrgencyRecords(threads.map((t) => t.id));
  const need = threads.filter(
    (thread) =>
      !existing[thread.id] ||
      existing[thread.id].messageFingerprint !== thread.lastMessageId,
  );
  const decisions = new Map<string, UrgencyDecision>();
  const candidates: typeof need = [];
  for (const t of need) {
    if (
      isNotificationMail(t.from, t.subject) ||
      t.listUnsub ||
      t.labelIds.some((l) => NEWSLETTER_CATEGORIES.includes(l))
    ) {
      decisions.set(t.id, {
        urgency: "later",
        reason: "Automated notification or newsletter.",
        confidence: "high",
      });
    } else {
      candidates.push(t);
    }
  }
  const judged = await classifyUrgencyDetailed(candidates);
  for (const [id, decision] of judged) decisions.set(id, decision);
  const fingerprints = new Map(
    need.map((thread) => [thread.id, thread.lastMessageId]),
  );
  await saveUrgencyDecisions(decisions, fingerprints);

  const urgencyByThread = new Map<string, UrgencyDecision>();
  for (const [id, record] of Object.entries(existing)) {
    urgencyByThread.set(id, record);
  }
  for (const [id, decision] of decisions) urgencyByThread.set(id, decision);

  const urgentPartnerThreads = threads
    .filter((thread) => {
      const decision = urgencyByThread.get(thread.id);
      return (
        thread.unread &&
        bucketByThread.get(thread.id) === "current" &&
        decision?.urgency === "now" &&
        decision.confidence !== "low"
      );
    })
    .map((thread) => {
      const decision = urgencyByThread.get(thread.id)!;
      return {
        id: thread.id,
        lastMessageId: thread.lastMessageId,
        from: thread.from,
        subject: thread.subject,
        date: thread.date,
        reason: decision.reason,
        confidence: decision.confidence as "high" | "medium",
      };
    });

  return { classified: decided.length, applied, urgentPartnerThreads };
}
