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
  classifyUrgency,
  fetchUrgency,
  saveUrgency,
  Urgency,
} from "@/lib/mail-urgency";

const NEWSLETTER_CATEGORIES = [
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
];

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
export async function classifyInbox(
  token: string,
): Promise<{ classified: number; applied: Record<string, number> }> {
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
      });
    }
  }

  if (partnerCandidates.length > 0 && isAnthropicConfigured && isCrmConfigured) {
    const { data: partners } = await crmSupabase
      .from("partners")
      .select("name, status");
    const partnerList = (partners || [])
      .map((p) => `- ${p.name} (status: ${p.status || "unknown"})`)
      .join("\n");
    const domains = Array.from(
      new Map(
        partnerCandidates.flatMap((candidate) =>
          candidate.domains.map((domain) => [domain, candidate.from]),
        ),
      ).entries(),
    ).map(([domain, from]) => `${domain} (e.g. ${from})`);

    const system = `You sort email senders into buckets for a Willow team member. Willow's CRM partners:\n${partnerList}\n\nFor each sender domain, decide: "current" if it belongs to a partner whose status is Active or Onboarding; "potential" if it belongs to a partner with any other status (New Lead, Contacted, Proposal Sent, etc.); "other" if it isn't one of these partners. Match by organization name/domain. When unsure, use "other".`;

    let map: Record<string, "current" | "potential" | "other"> = {};
    try {
      const resp = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        system,
        output_config: { format: { type: "json_schema", schema: ASSIGN_SCHEMA } },
        messages: [
          { role: "user", content: `Sender domains:\n${domains.join("\n")}` },
        ],
      } as Anthropic.MessageCreateParamsNonStreaming);
      const text = resp.content.find((b) => b.type === "text");
      const parsed = JSON.parse(text && "text" in text ? text.text : "{}");
      for (const a of parsed.assignments || []) map[a.domain] = a.bucket;
    } catch (err) {
      console.warn("Classify model error:", err);
      map = {};
    }

    for (const c of partnerCandidates) {
      const domainBuckets = c.domains.map((domain) => map[domain] || "other");
      const bucket = domainBuckets.includes("current")
        ? "current"
        : domainBuckets.includes("potential")
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
  for (const d of decided) {
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
  const existing = await fetchUrgency(threads.map((t) => t.id));
  const need = threads.filter((t) => !existing[t.id]);
  const urgencyMap = new Map<string, Urgency>();
  const candidates: typeof need = [];
  for (const t of need) {
    if (
      isNotificationMail(t.from, t.subject) ||
      t.listUnsub ||
      t.labelIds.some((l) => NEWSLETTER_CATEGORIES.includes(l))
    ) {
      urgencyMap.set(t.id, "later"); // auto-mail rarely needs action
    } else {
      candidates.push(t);
    }
  }
  const judged = await classifyUrgency(candidates);
  for (const [id, u] of judged) urgencyMap.set(id, u);
  await saveUrgency(urgencyMap);

  return { classified: decided.length, applied };
}
