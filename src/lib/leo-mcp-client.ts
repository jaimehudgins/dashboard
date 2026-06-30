// Minimal client for Leo's own MCP server (/api/mcp), used server-side by the
// in-app chat so it shares one tool definition source with everything else.

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

async function mcpCall(
  base: string,
  token: string | undefined,
  body: unknown,
): Promise<any> {
  const res = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  // Responses come back as SSE frames: `event: message\ndata: {json}`.
  let json: any;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("data:")) {
      try {
        const parsed = JSON.parse(t.slice(5).trim());
        if (parsed.result || parsed.error) json = parsed;
      } catch {
        /* keep scanning */
      }
    }
  }
  if (!json) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Unparseable MCP response (HTTP ${res.status})`);
    }
  }
  if (json.error) throw new Error(json.error.message || "MCP error");
  return json.result;
}

export async function listLeoTools(
  base: string,
  token?: string,
): Promise<McpToolDef[]> {
  const result = await mcpCall(base, token, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });
  return result.tools || [];
}

export async function callLeoTool(
  base: string,
  token: string | undefined,
  name: string,
  args: unknown,
): Promise<string> {
  const result = await mcpCall(base, token, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const block = (result.content || []).find(
    (c: { type: string }) => c.type === "text",
  );
  return block?.text ?? JSON.stringify(result);
}
