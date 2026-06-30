import { supabase } from "./supabase";

// Granola public API client (read-only). Bearer key (grn_*) generated in the
// Granola desktop app: Settings → Connectors → API keys. Docs:
// https://docs.granola.ai/introduction  (base https://public-api.granola.ai/v1)
//
// Shape note: GET /notes is metadata-only (id, title, owner, created_at).
// Full content (attendees, transcript, summary, calendar_event) only comes from
// GET /notes/{id}. The API only lists/returns notes that already have a
// generated AI summary + transcript.
const BASE = "https://public-api.granola.ai/v1";
const KEY = process.env.GRANOLA_API_KEY?.trim();

export const isGranolaConfigured = !!KEY;

async function granolaFetch(path: string, attempt = 0): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  // Respect rate limits (burst 25/5s, 300/min) and transient 5xx with backoff.
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1) * (attempt + 1)));
    return granolaFetch(path, attempt + 1);
  }
  return res;
}

async function granolaJson(path: string): Promise<any> {
  const res = await granolaFetch(path);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Granola API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Run async work with bounded concurrency (stay under the rate limit).
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (x: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export interface GranolaAttendee {
  name: string;
  email?: string;
}

export interface GranolaNote {
  id: string;
  title: string;
  summary: string;
  ownerName: string;
  ownerEmail: string;
  attendees: GranolaAttendee[];
  meetingDate: string | null; // ISO
  transcriptText: string;
  webUrl: string;
}

interface GranolaNoteRef {
  id: string;
  title: string;
  createdAt: string;
}

function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || "Me";
}

function normalizeAttendees(raw: any): GranolaAttendee[] {
  const attendees = Array.isArray(raw?.attendees) ? raw.attendees : [];
  let list = attendees
    .map((a: any) => ({
      name:
        typeof a?.name === "string" && a.name.trim()
          ? a.name
          : typeof a?.email === "string"
            ? a.email
            : "",
      email: typeof a?.email === "string" ? a.email.toLowerCase() : undefined,
    }))
    .filter((a: GranolaAttendee) => a.name || a.email);

  // Fall back to calendar invitees (emails) when attendees aren't populated.
  if (list.length === 0 && Array.isArray(raw?.calendar_event?.invitees)) {
    list = raw.calendar_event.invitees
      .filter((i: any) => typeof i?.email === "string")
      .map((i: any) => ({ name: i.email, email: i.email.toLowerCase() }));
  }
  return list;
}

// Speakers are only tagged microphone (the owner) vs speaker (everyone else),
// so label the owner's lines with their name and the rest as "Them".
function flattenTranscript(raw: any, ownerName: string): string {
  const arr = raw?.transcript;
  if (!Array.isArray(arr)) return "";
  const me = firstName(ownerName);
  return arr
    .map((seg: any) => {
      const text = typeof seg?.text === "string" ? seg.text.trim() : "";
      if (!text) return "";
      const source = seg?.speaker?.source;
      const who =
        source === "microphone" ? me : source === "speaker" ? "Them" : "";
      return who ? `${who}: ${text}` : text;
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeFullNote(raw: any): GranolaNote {
  const ownerName =
    typeof raw?.owner?.name === "string" ? raw.owner.name : "";
  return {
    id: raw.id,
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title
        : "(untitled meeting)",
    summary:
      (typeof raw.summary_markdown === "string" && raw.summary_markdown) ||
      (typeof raw.summary_text === "string" && raw.summary_text) ||
      "",
    ownerName,
    ownerEmail:
      typeof raw?.owner?.email === "string" ? raw.owner.email.toLowerCase() : "",
    attendees: normalizeAttendees(raw),
    meetingDate:
      raw?.calendar_event?.scheduled_start_time || raw?.created_at || null,
    transcriptText: flattenTranscript(raw, ownerName),
    webUrl: typeof raw.web_url === "string" ? raw.web_url : "",
  };
}

// One page of note refs (metadata only) since `createdAfter`.
async function listRefsPage(opts: {
  createdAfter?: string;
  cursor?: string;
}): Promise<{ refs: GranolaNoteRef[]; cursor: string | null }> {
  const params = new URLSearchParams();
  if (opts.createdAfter) params.set("created_after", opts.createdAfter);
  if (opts.cursor) params.set("cursor", opts.cursor);
  const data = await granolaJson(`/notes?${params}`);
  const refs = (data.notes || []).map((n: any) => ({
    id: n.id,
    title: n.title || "",
    createdAt: n.created_at || "",
  }));
  return { refs, cursor: data.hasMore ? data.cursor || null : null };
}

async function listRefsSince(createdAfter: string): Promise<GranolaNoteRef[]> {
  const out: GranolaNoteRef[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await listRefsPage({ createdAfter, cursor: cursor ?? undefined });
    out.push(...page.refs);
    cursor = page.cursor;
  } while (cursor);
  return out;
}

// Full note (attendees, transcript, summary). Returns null if it 404s (e.g. a
// note still being processed).
export async function getNote(id: string): Promise<GranolaNote | null> {
  const res = await granolaFetch(`/notes/${id}?include=transcript`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Granola API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return normalizeFullNote(data.note || data);
}

// Pull Granola notes and cache full meeting metadata + transcripts. Lists the
// last 30 days (cheap, metadata-only), then fetches full content for any
// meeting we don't yet have a transcript for — self-healing and incremental.
export async function syncGranola(): Promise<{
  fetched: number;
  total: number;
}> {
  const createdAfter = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const refs = await listRefsSince(createdAfter);

  const { data: have } = await supabase
    .from("granola_transcripts")
    .select("meeting_id");
  const cached = new Set((have || []).map((r) => r.meeting_id as string));

  const toFetch = refs.filter((r) => !cached.has(r.id));
  let fetched = 0;

  await mapLimit(toFetch, 3, async (ref) => {
    let note: GranolaNote | null;
    try {
      note = await getNote(ref.id);
    } catch (e) {
      console.warn("granola getNote:", ref.id, (e as Error).message);
      return;
    }
    if (!note) return;

    const { error } = await supabase.from("granola_meetings").upsert(
      {
        id: note.id,
        title: note.title,
        summary: note.summary,
        owner_name: note.ownerName,
        owner_email: note.ownerEmail,
        attendees: note.attendees,
        meeting_date: note.meetingDate,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn("granola upsert meeting:", note.id, error.message);
      return;
    }
    if (note.transcriptText) {
      await supabase.from("granola_transcripts").upsert(
        { meeting_id: note.id, transcript: note.transcriptText },
        { onConflict: "meeting_id" },
      );
    }
    fetched++;
  });

  return { fetched, total: refs.length };
}
