import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";
import {
  listAllEvents,
  listCalendars,
  ownedCalendars,
  queryFreeBusy,
  findFreeSlots,
  FreeSlot,
} from "@/lib/google-calendar";

// Charlie is a small calendar agent: it can read the user's events and find
// open time, then answer questions or propose meeting times. Tool execution
// runs server-side with the user's Google token; the model only sees results.

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_calendar_events",
    description:
      "List the user's own calendar events in a date range, optionally filtered by a search term (matched against title, attendees, location, and description). Use this to answer questions about the schedule — e.g. the next meeting with a person, what's on a given day, or how busy a week is. For 'next' or 'upcoming' questions, search from today forward (up to ~90 days).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        start: {
          type: "string",
          description: "Range start, ISO datetime or YYYY-MM-DD.",
        },
        end: {
          type: "string",
          description: "Range end, ISO datetime or YYYY-MM-DD.",
        },
        query: {
          type: "string",
          description:
            "Optional case-insensitive term to filter events by (person name, keyword). Omit to list everything in range.",
        },
      },
      required: ["start", "end"],
    },
  },
  {
    name: "find_free_time",
    description:
      "Find open slots of a given length within working hours (9am–5pm, weekdays) across the user's own calendars. Use this when the user wants to schedule or find time for something. Pass a title and any guest emails so the slots can be booked.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        durationMinutes: { type: "integer" },
        earliestDate: { type: "string", description: "YYYY-MM-DD" },
        latestDate: { type: "string", description: "YYYY-MM-DD" },
        partOfDay: { type: "string", enum: ["morning", "afternoon", "any"] },
        title: {
          type: "string",
          description: "A concise event title for the proposed meeting.",
        },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "Guest email addresses, only if explicit in the request.",
        },
      },
      required: ["durationMinutes", "earliestDate", "latestDate"],
    },
  },
];

const toRangeStart = (s: string) =>
  s.includes("T") ? s : new Date(`${s}T00:00:00`).toISOString();
const toRangeEnd = (s: string) =>
  s.includes("T") ? s : new Date(`${s}T23:59:59`).toISOString();

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken || session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAnthropicConfigured) {
    return NextResponse.json(
      { error: "Ask Charlie isn't configured (no API key)." },
      { status: 503 },
    );
  }

  let body: { question?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const question = (body.question || "").trim();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const token = session.accessToken;
  const today = new Date();
  const todayISO = today.toISOString().split("T")[0];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  // Captured when the agent calls find_free_time, so the UI can offer booking.
  let proposedSlots: FreeSlot[] = [];
  let proposal: { title: string; attendees: string[] } | null = null;

  async function runTool(name: string, input: any): Promise<unknown> {
    if (name === "list_calendar_events") {
      const { events } = await listAllEvents(
        token,
        toRangeStart(input.start),
        toRangeEnd(input.end),
        { ownedOnly: true },
      );
      const q = (input.query || "").toLowerCase();
      const filtered = q
        ? events.filter(
            (e) =>
              (e.title || "").toLowerCase().includes(q) ||
              (e.location || "").toLowerCase().includes(q) ||
              (e.description || "").toLowerCase().includes(q) ||
              (e.attendees || []).some(
                (a) =>
                  (a.email || "").toLowerCase().includes(q) ||
                  (a.displayName || "").toLowerCase().includes(q),
              ),
          )
        : events;
      return filtered.slice(0, 50).map((e) => ({
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        location: e.location,
        calendar: e.calendarSummary,
        attendees: (e.attendees || [])
          .map((a) => a.displayName || a.email)
          .filter(Boolean),
        hasMeet: !!e.hangoutLink,
      }));
    }

    if (name === "find_free_time") {
      const rangeStart = new Date(`${input.earliestDate}T00:00:00`);
      const rangeEnd = new Date(`${input.latestDate}T23:59:59`);
      const effectiveStart =
        rangeStart.getTime() < today.getTime() ? today : rangeStart;
      const calendars = await listCalendars(token);
      const busy = await queryFreeBusy(
        token,
        effectiveStart.toISOString(),
        rangeEnd.toISOString(),
        ownedCalendars(calendars).map((c) => c.id),
      );
      let slots = findFreeSlots({
        busy,
        rangeStart: effectiveStart,
        rangeEnd,
        durationMin: input.durationMinutes || 30,
      });
      if (input.partOfDay === "morning")
        slots = slots.filter((s) => new Date(s.start).getHours() < 12);
      else if (input.partOfDay === "afternoon")
        slots = slots.filter((s) => new Date(s.start).getHours() >= 12);
      slots = slots.slice(0, 12);
      proposedSlots = slots;
      proposal = {
        title: input.title || "Meeting",
        attendees: Array.isArray(input.attendees) ? input.attendees : [],
      };
      return { slots, count: slots.length };
    }

    return { error: `Unknown tool: ${name}` };
  }

  const system = `You are Charlie, ${session.user?.name || "the user"}'s calendar assistant (named after Charlie Young, who ran President Bartlet's schedule). Today is ${todayISO} (${tz}). Answer questions about the calendar and help find time, using the tools. Only the user's own calendars are visible to the tools. Be warm but concise — a sentence or two. When you reference an event, include its day and time in plain language. If you couldn't find anything, say so plainly.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: question },
  ];

  try {
    let answer = "";
    for (let i = 0; i < 6; i++) {
      const response = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 2048,
        system,
        tools: TOOLS,
        output_config: { effort: "low" },
        messages,
      } as Anthropic.MessageCreateParamsNonStreaming);

      if (response.stop_reason !== "tool_use") {
        answer = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await runTool(block.name, block.input);
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }
      messages.push({ role: "user", content: results });
    }

    return NextResponse.json({
      answer: answer || "I couldn't work that out from the calendar.",
      slots: proposedSlots,
      proposal,
    });
  } catch (err) {
    console.error("Ask Charlie error:", err);
    return NextResponse.json(
      { error: "Charlie ran into a problem answering that." },
      { status: 500 },
    );
  }
}
