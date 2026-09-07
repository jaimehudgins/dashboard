import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "./anthropic";
import { callLeoTool, listLeoTools } from "./leo-mcp-client";

export interface LeoAgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LeoAgentResult {
  reply: string;
  toolsUsed: string[];
}

export async function runLeoAgent(input: {
  base: string;
  token?: string;
  name: string;
  messages: LeoAgentMessage[];
  surface?: "web" | "slack";
}): Promise<LeoAgentResult> {
  const today = new Date().toISOString().split("T")[0];
  const tz = "America/Chicago";
  const confirmationGuidance =
    input.surface === "slack"
      ? `You are replying in a private Slack conversation. Keep the response especially concise and do not use Markdown tables. A direct request to create, update, or complete an internal Leo task is approval to do exactly that; call the task tool with confirm=true. For email sends, calendar changes, CRM writes, memory deletion, or any other external/destructive action, describe the proposed change and wait for explicit confirmation in a later message.`
      : `When something would create or change data (a task, calendar event, email follow-up, or memory), first state exactly what you'll do and ask ${input.name} to confirm; only after they agree, call the tool again with confirm=true.`;
  const system = `You are Leo, ${input.name}'s chief of staff — calm, warm, and decisive, in the spirit of Leo McGarry. Today is ${today} (${tz}). You have tools to read and act on ${input.name}'s tasks, calendar, partner CRM, email, and a persistent memory. Use them rather than guessing. Keep replies brief and plain. ${confirmationGuidance} If you recall or store something, mention it briefly.`;

  const mcpTools = await listLeoTools(input.base, input.token);
  const tools = mcpTools.map((tool) => {
    const { $schema, ...schema } = tool.inputSchema as Record<string, unknown>;
    void $schema;
    return {
      name: tool.name,
      description: tool.description || "",
      input_schema: schema as Anthropic.Tool.InputSchema,
    };
  });
  const messages: Anthropic.MessageParam[] = input.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const toolsUsed: string[] = [];
  let reply = "";
  for (let iteration = 0; iteration < 8; iteration++) {
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
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      break;
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      toolsUsed.push(block.name);
      let output: string;
      try {
        output = await callLeoTool(input.base, input.token, block.name, block.input);
      } catch (error) {
        output = `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: output,
      });
    }
    messages.push({ role: "user", content: results });
  }

  return {
    reply: reply || "(I didn't have anything to add.)",
    toolsUsed: [...new Set(toolsUsed)],
  };
}
