import type Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import { anthropic, isAnthropicConfigured } from "./anthropic";

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"),
  );
  return m ? decodeEntities(m[1]) : "";
}

// Minimal RSS/Atom parser (no XML dependency).
function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks =
    xml.match(/<item[\s\S]*?<\/item>/gi) ||
    xml.match(/<entry[\s\S]*?<\/entry>/gi) ||
    [];
  for (const b of blocks) {
    let link = tag(b, "link");
    if (!link) {
      const href = b.match(/<link[^>]*href="([^"]+)"/i);
      if (href) link = href[1];
    }
    items.push({
      title: tag(b, "title"),
      link,
      description: tag(b, "description") || tag(b, "summary") || tag(b, "content"),
      pubDate: tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || null,
    });
  }
  return items;
}

const SCORE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "number" },
          summary: { type: "string", description: "One sentence." },
          relevance: {
            type: "number",
            description: "0-100 relevance to Jaime's work.",
          },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["index", "summary", "relevance", "tags"],
      },
    },
  },
  required: ["items"],
};

async function scoreItems(
  items: FeedItem[],
): Promise<Map<number, { summary: string; relevance: number; tags: string[] }>> {
  const out = new Map<number, { summary: string; relevance: number; tags: string[] }>();
  if (!isAnthropicConfigured || items.length === 0) return out;
  const system = `You are CJ, field-intelligence analyst for Jaime, a college & career readiness (CCR) / curriculum leader at Willow. For each item, write a one-sentence summary and score its relevance (0-100) to Jaime's work: career & college readiness, curriculum, durable/employability skills, education policy, K-12 funders/philanthropy, workforce trends, and comparable programs. 0 = irrelevant, 100 = directly actionable. Add 1-3 short topic tags.`;
  const list = items
    .map(
      (it, i) =>
        `index:${i} | ${it.title} — ${(it.description || "").slice(0, 240)}`,
    )
    .join("\n");
  try {
    const resp = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system,
      output_config: { format: { type: "json_schema", schema: SCORE_SCHEMA } },
      messages: [{ role: "user", content: list }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = resp.content.find((b) => b.type === "text");
    const parsed = JSON.parse(text && "text" in text ? text.text : "{}");
    for (const r of parsed.items || []) {
      if (typeof r.index === "number")
        out.set(r.index, {
          summary: r.summary || "",
          relevance: Math.max(0, Math.min(100, Math.round(r.relevance || 0))),
          tags: Array.isArray(r.tags) ? r.tags.slice(0, 3) : [],
        });
    }
  } catch (err) {
    console.warn("field score:", (err as Error).message);
  }
  return out;
}

// Pull each active source, score new items, and cache them as field_signals.
export async function scanField(): Promise<{ sources: number; added: number }> {
  const { data: sources } = await supabase
    .from("field_sources")
    .select("*")
    .eq("active", true);
  if (!sources || sources.length === 0) return { sources: 0, added: 0 };

  // Skip URLs we already have.
  const { data: existing } = await supabase
    .from("field_signals")
    .select("url");
  const seen = new Set((existing || []).map((s) => s.url as string));

  let added = 0;
  for (const src of sources) {
    let xml = "";
    try {
      const res = await fetch(src.url as string, {
        headers: { "User-Agent": "LeoFieldIntel/1.0" },
      });
      if (!res.ok) continue;
      xml = await res.text();
    } catch {
      continue;
    }
    const fresh = parseFeed(xml)
      .filter((it) => it.link && !seen.has(it.link))
      .slice(0, 12);
    if (fresh.length === 0) continue;

    const scores = await scoreItems(fresh);
    const rows = fresh.map((it, i) => {
      const s = scores.get(i);
      return {
        source_name: src.name as string,
        title: it.title.slice(0, 400),
        summary: s?.summary || it.description.slice(0, 300),
        url: it.link,
        relevance: s?.relevance ?? 0,
        tags: s?.tags ?? [],
        published_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      };
    });
    const { error } = await supabase
      .from("field_signals")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: true });
    if (!error) {
      added += rows.length;
      rows.forEach((r) => seen.add(r.url));
    }
  }
  return { sources: sources.length, added };
}
