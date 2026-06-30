import { supabase } from "./supabase";

// Read helpers over cached Granola meetings/transcripts, used by the MCP tools
// (and thus the in-Leo chat) to answer "what did X say about Y?".

interface MeetingRow {
  id: string;
  title: string;
  meeting_date: string | null;
  attendees: { name: string; email?: string }[];
  summary?: string;
  hidden?: boolean;
}

export interface MeetingSummary {
  id: string;
  title: string;
  date: string | null;
  attendees: string[];
  summary?: string;
}

export async function listMeetings(limit = 15): Promise<MeetingSummary[]> {
  const { data } = await supabase
    .from("granola_meetings")
    .select("*")
    .order("meeting_date", { ascending: false })
    .limit(Math.min(limit * 2, 80));
  return ((data as MeetingRow[]) || [])
    .filter((m) => !m.hidden)
    .slice(0, limit)
    .map((m) => ({
    id: m.id,
    title: m.title,
    date: m.meeting_date,
    attendees: (m.attendees || []).map((a) => a.name).filter(Boolean),
    summary: m.summary ? m.summary.slice(0, 1200) : undefined,
  }));
}

// Recent meetings linked to a CRM partner (via partner-tagged extracted tasks),
// newest first, with a short summary. Used to surface "from your meeting on X"
// context on a partner.
export async function meetingsForPartner(
  partnerId: string,
  limit = 5,
): Promise<MeetingSummary[]> {
  if (!partnerId) return [];
  const { data: tasks } = await supabase
    .from("granola_extracted_tasks")
    .select("meeting_id")
    .eq("partner_id", partnerId);
  const meetingIds = Array.from(
    new Set((tasks || []).map((t) => t.meeting_id as string)),
  );
  if (meetingIds.length === 0) return [];

  const { data } = await supabase
    .from("granola_meetings")
    .select("*")
    .in("id", meetingIds)
    .order("meeting_date", { ascending: false })
    .limit(Math.min(limit * 2, 20));
  return ((data as MeetingRow[]) || [])
    .filter((m) => !m.hidden)
    .slice(0, limit)
    .map((m) => ({
    id: m.id,
    title: m.title,
    date: m.meeting_date,
    attendees: (m.attendees || []).map((a) => a.name).filter(Boolean),
    summary: m.summary ? m.summary.slice(0, 800) : undefined,
  }));
}

const STOP = new Set([
  "the", "what", "did", "say", "said", "about", "her", "his", "their", "and",
  "for", "with", "that", "this", "have", "has", "was", "were", "are", "you",
  "your", "leo", "tell", "when", "how", "does", "is", "a", "an", "of", "to",
  "in", "on", "at", "i", "we", "they", "it", "any", "all", "from", "talk",
  "talked", "mention", "mentioned", "discuss", "discussed", "regarding",
]);

export interface TranscriptHit {
  id: string;
  title: string;
  date: string | null;
  attendees: string[];
  excerpts: string[];
}

// Search cached transcripts for the query terms, optionally scoped to meetings
// involving `person`. Returns the best-matching meetings with short excerpts.
export async function searchTranscripts(
  query: string,
  person?: string,
  max = 6,
): Promise<TranscriptHit[]> {
  const terms = (query.toLowerCase().match(/[a-z0-9']+/g) || []).filter(
    (w) => w.length >= 3 && !STOP.has(w),
  );

  const { data: meetings } = await supabase
    .from("granola_meetings")
    .select("*")
    .order("meeting_date", { ascending: false });
  let candidates = ((meetings as MeetingRow[]) || []).filter((m) => !m.hidden);

  if (person) {
    const p = person.toLowerCase();
    candidates = candidates.filter(
      (m) =>
        (m.title || "").toLowerCase().includes(p) ||
        (m.attendees || []).some(
          (a) =>
            (a.name || "").toLowerCase().includes(p) ||
            (a.email || "").toLowerCase().includes(p),
        ),
    );
  }
  if (candidates.length === 0) return [];

  const ids = candidates.map((m) => m.id);
  const { data: trs } = await supabase
    .from("granola_transcripts")
    .select("meeting_id, transcript")
    .in("meeting_id", ids);
  const textById = new Map(
    (trs || []).map((t) => [t.meeting_id as string, t.transcript as string]),
  );

  const results: (TranscriptHit & { score: number })[] = [];
  for (const m of candidates) {
    const text = textById.get(m.id);
    if (!text) continue;
    const lines = text.split("\n");
    const excerpts: string[] = [];
    let score = 0;

    if (terms.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        const lower = lines[i].toLowerCase();
        if (terms.some((t) => lower.includes(t))) {
          score++;
          if (excerpts.length < 4) {
            excerpts.push(
              lines
                .slice(Math.max(0, i - 1), i + 2)
                .join(" ")
                .slice(0, 400),
            );
          }
        }
      }
    } else if (person) {
      // Person-only query: hand back the opening of their conversation.
      score = 1;
      excerpts.push(lines.slice(0, 8).join(" ").slice(0, 500));
    }

    if (score > 0) {
      results.push({
        id: m.id,
        title: m.title,
        date: m.meeting_date,
        attendees: (m.attendees || []).map((a) => a.name).filter(Boolean),
        excerpts,
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, max).map(({ score: _score, ...r }) => r);
}
