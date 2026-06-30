import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";
import { listLeoTools, callLeoTool } from "@/lib/leo-mcp-client";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// POST /api/chat  { messages: ChatMessage[] }
// Runs Leo as a tool-using agent over his own MCP tool surface and returns the
// final reply (plus the names of any tools used, for display).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const allowed = process.env.LEO_ALLOWED_EMAIL ?? "jaime@willowed.org";
  if (!session?.user?.email || session.user.email !== allowed) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  if (!isAnthropicConfigured) {
    return NextResponse.json(
      { error: "Chat isn't configured (no Anthropic API key)." },
      { status: 503 },
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = (body.messages || []).filter((m) => m.content?.trim());
  if (input.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  // Resolve our own origin robustly behind Vercel's proxy.
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const base = host ? `${proto}://${host}` : new URL(req.url).origin;
  const token = process.env.MCP_TOKEN?.trim();

  const today = new Date().toISOString().split("T")[0];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const name = session.user.name || "Jaime";
  const system = `You are Leo, ${name}'s chief of staff — calm, warm, and decisive, in the spirit of Leo McGarry. Today is ${today} (${tz}). You have tools to read and act on ${name}'s tasks, calendar, partner CRM, email, and a persistent memory. Use them rather than guessing. Keep replies brief and plain. When something would create or change data (a task, calendar event, email follow-up, or memory), first state exactly what you'll do and ask ${name} to confirm; only after they agree, call the tool again with confirm=true. If you recall or store something, mention it briefly.`;

  try {
    const mcpTools = await listLeoTools(base, token);
    const tools = mcpTools.map((t) => {
      // Drop the JSON-Schema `$schema` keyword; Anthropic just wants the shape.
      const { $schema, ...schema } = t.inputSchema as Record<string, unknown>;
      void $schema;
      return {
        name: t.name,
        description: t.description || "",
        input_schema: schema as Anthropic.Tool.InputSchema,
      };
    });

    const messages: Anthropic.MessageParam[] = input.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const toolsUsed: string[] = [];
    let reply = "";

    for (let i = 0; i < 8; i++) {
      const response = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        system,
        tools,
        output_config: { effort: "low" },
        messages,
      } as Anthropic.MessageCreateParamsNonStreaming);

      if (response.stop_reason !== "tool_use") {
        reply = response.content
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
          toolsUsed.push(block.name);
          let out: string;
          try {
            out = await callLeoTool(base, token, block.name, block.input);
          } catch (err) {
            out = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: out,
          });
        }
      }
      messages.push({ role: "user", content: results });
    }

    return NextResponse.json({
      reply: reply || "(I didn't have anything to add.)",
      toolsUsed: [...new Set(toolsUsed)],
    });
  } catch (err) {
    console.error("Chat error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Leo ran into a problem: ${detail}` },
      { status: 500 },
    );
  }
}
