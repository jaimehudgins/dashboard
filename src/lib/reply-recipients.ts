export type ReplyMode = "sender" | "all";

// Parse ordinary mailbox lists without treating an email-looking display name
// as another recipient. Unusual/malformed headers fail closed, not partially.
function addresses(header: string): string[] {
  if (!header.trim()) return [];
  if (/[\r\n]/.test(header)) throw new Error("Invalid recipient header");
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let angled = false;
  let escaped = false;
  for (let i = 0; i < header.length; i++) {
    const char = header[i];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === "\\") { escaped = true; continue; }
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "<") {
      if (angled) throw new Error("Invalid recipient header");
      angled = true;
    }
    if (!quoted && char === ">") {
      if (!angled) throw new Error("Invalid recipient header");
      angled = false;
    }
    if (!quoted && !angled && char === ",") { parts.push(header.slice(start, i)); start = i + 1; }
  }
  if (quoted || angled || escaped) throw new Error("Invalid recipient header");
  parts.push(header.slice(start));
  return parts.map((part) => {
    const value = part.trim();
    const named = value.match(/^(?:"(?:[^"\\]|\\.)*"|[^<>]*)<([^<>]+)>$/);
    const address = (named?.[1] ?? value).trim();
    if (!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i.test(address)) throw new Error("Unsupported recipient header");
    return address;
  });
}

export function replyRecipients(context: {
  to: string;
  originalTo: string;
  originalCc: string;
  ownAddresses: string[];
}, mode: ReplyMode, accountEmail: string): { to: string; cc: string } {
  if (mode === "sender") return { to: context.to, cc: "" };
  if (!accountEmail) throw new Error("Mailbox identity is unavailable");
  const seen = new Set([accountEmail, ...context.ownAddresses].flatMap(addresses).map((address) => address.toLowerCase()));
  const unique = (values: string[]) => values.filter((address) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const to = unique([...addresses(context.to), ...addresses(context.originalTo)]);
  const cc = unique(addresses(context.originalCc));
  if (!to.length) throw new Error("No reply recipient remains");
  return { to: to.join(", "), cc: cc.join(", ") };
}
