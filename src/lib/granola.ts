import { supabase } from "./supabase";

// Granola public API client (read-only). Bearer key (grn_*) generated in the
// Granola desktop app: Settings → Connectors → API keys. Docs:
// https://docs.granola.ai/introduction  (base https://public-api.granola.ai/v1)
const BASE = "https://public-api.granola.ai/v1";
const KEY = process.env.GRANOLA_API_KEY?.trim();

export const isGranolaConfigured = !!KEY;

async function granolaFetch(
  path: string,
  attempt = 0,
): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  // Respect rate limits (burst 25/5s, 300/min) and transient 5xx with backoff.
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1) * (attempt + 1)));
    return granolaFetch(path, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Granola API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
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
}

// The note JSON shape isn't fully pinned in the docs, so read fields defensively
// across the likely key names.
function pickString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v;
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const nested = o.text ?? o.content ?? o.markdown;
      if (typeof nested === "string" && nested.trim()) return nested;
    }
  }
  return "";
}

function normalizeAttendees(raw: any): GranolaAttendee[] {
  const list =
    raw?.attendees ?? raw?.people ?? raw?.participants ?? raw?.guests ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .map((a: any) => ({
      name: pickString(a?.name, a?.display_name, a?.full_name, a?.email),
      email:
        typeof a?.email === "string" ? a.email.toLowerCase() : undefined,
    }))
    .filter((a: GranolaAttendee) => a.name || a.email);
}

function flattenTranscript(raw: any): string {
  const arr = raw?.transcript;
  if (!Array.isArray(arr)) return "";
  return arr
    .map((seg: any) => {
      const who = pickString(
        seg?.speaker?.name,
        seg?.speaker,
        seg?.speaker?.source,
        seg?.source,
        seg?.diarization_label,
      );
      const text = pickString(seg?.text, seg?.content);
      if (!text) return "";
      return who ? `${who}: ${text}` : text;
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeNote(raw: any): GranolaNote {
  return {
    id: raw.id,
    title: pickString(raw.title, raw.name) || "(untitled meeting)",
    summary: pickString(raw.summary, raw.notes, raw.ai_summary),
    ownerName: pickString(raw.owner?.name, raw.owner?.display_name),
    ownerEmail:
      typeof raw.owner?.email === "string"
        ? raw.owner.email.toLowerCase()
        : "",
    attendees: normalizeAttendees(raw),
    meetingDate:
      pickString(
        raw.meeting_date,
        raw.start_time,
        raw.started_at,
        raw.created_at,
        raw.date,
      ) || null,
    transcriptText: flattenTranscript(raw),
  };
}

// One page of notes (with transcripts) since `createdAfter`.
async function listNotesPage(opts: {
  createdAfter?: string;
  cursor?: string;
}): Promise<{ notes: GranolaNote[]; cursor: string | null }> {
  const params = new URLSearchParams({ include: "transcript" });
  if (opts.createdAfter) params.set("created_after", opts.createdAfter);
  if (opts.cursor) params.set("cursor", opts.cursor);
  const data = await granolaFetch(`/notes?${params}`);
  const notes = (data.notes || []).map(normalizeNote);
  return { notes, cursor: data.hasMore ? data.cursor || null : null };
}

// All notes created after `createdAfter`, following cursor pagination.
export async function listNotesSince(
  createdAfter?: string,
): Promise<GranolaNote[]> {
  const out: GranolaNote[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await listNotesPage({ createdAfter, cursor: cursor ?? undefined });
    out.push(...page.notes);
    cursor = page.cursor;
  } while (cursor);
  return out;
}

// Newest meeting we've already cached, used as the incremental watermark.
async function lastSyncedMeetingDate(): Promise<string | null> {
  const { data } = await supabase
    .from("granola_meetings")
    .select("meeting_date")
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.meeting_date as string) || null;
}

// Pull new Granola notes and cache meeting metadata + transcripts. Incremental:
// fetches notes after the newest one we have, or the last 30 days on first run.
export async function syncGranola(): Promise<{
  synced: number;
  total: number;
}> {
  const watermark = await lastSyncedMeetingDate();
  const createdAfter =
    watermark ||
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const notes = await listNotesSince(createdAfter);
  let synced = 0;
  for (const note of notes) {
    if (!note.id) continue;
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
      continue;
    }
    if (note.transcriptText) {
      await supabase.from("granola_transcripts").upsert(
        { meeting_id: note.id, transcript: note.transcriptText },
        { onConflict: "meeting_id" },
      );
    }
    synced++;
  }
  return { synced, total: notes.length };
}
