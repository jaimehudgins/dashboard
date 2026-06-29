import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();

export const isAnthropicConfigured = !!process.env.ANTHROPIC_API_KEY;

export interface ParsedSchedule {
  title: string;
  durationMinutes: number;
  attendees: string[];
  earliestDate: string; // YYYY-MM-DD
  latestDate: string; // YYYY-MM-DD
  partOfDay: "morning" | "afternoon" | "any";
}

const SCHEDULE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: {
      type: "string",
      description:
        "A concise event title from the request, e.g. 'Call with Sarah'. Default to 'Meeting' if none implied.",
    },
    durationMinutes: {
      type: "integer",
      description:
        "Meeting length in minutes. Default 30 if the request doesn't say.",
    },
    attendees: {
      type: "array",
      items: { type: "string" },
      description:
        "Email addresses of named guests, only if explicit email addresses appear in the request. Otherwise an empty array.",
    },
    earliestDate: {
      type: "string",
      description:
        "Earliest date to consider, YYYY-MM-DD, resolved relative to today. Default to today if unspecified.",
    },
    latestDate: {
      type: "string",
      description:
        "Latest date to consider, YYYY-MM-DD. Default to 7 days after earliestDate if unspecified.",
    },
    partOfDay: {
      type: "string",
      enum: ["morning", "afternoon", "any"],
      description:
        "Time-of-day preference if stated (e.g. 'mornings'); otherwise 'any'.",
    },
  },
  required: [
    "title",
    "durationMinutes",
    "attendees",
    "earliestDate",
    "latestDate",
    "partOfDay",
  ],
};

// Extracts structured scheduling parameters from a natural-language request.
export async function parseSchedulingRequest(
  request: string,
  todayISO: string,
): Promise<ParsedSchedule> {
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: `You turn a natural-language scheduling request into structured parameters for a calendar "find a time" search. Today's date is ${todayISO}. Resolve all relative dates ("next week", "Tuesday", "tomorrow") to absolute YYYY-MM-DD dates. Only include attendees when the request contains explicit email addresses.`,
    output_config: {
      format: { type: "json_schema", schema: SCHEDULE_SCHEMA },
    },
    messages: [{ role: "user", content: request }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  let raw = "{}";
  for (const block of response.content) {
    if (block.type === "text") {
      raw = block.text;
      break;
    }
  }
  return JSON.parse(raw) as ParsedSchedule;
}
