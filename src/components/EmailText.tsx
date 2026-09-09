import type { ReactNode } from "react";

function emailLinkLabel(url: string): string {
  if (url.includes("docs.google.com/document/")) return "Open Google Doc";
  if (url.includes("docs.google.com/spreadsheets/")) return "Open Google Sheet";
  if (url.includes("docs.google.com/presentation/")) return "Open Google Slides";
  if (url.includes("drive.google.com/")) return "Open Google Drive file";
  return url;
}

export default function EmailText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = /https?:\/\/[^\s<>"']+/gi;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const matchIndex = match.index ?? 0;
    const rawUrl = match[0];
    const url = rawUrl.replace(/[)\]},.;!?]+$/g, "");
    parts.push(text.slice(lastIndex, matchIndex));
    parts.push(<a key={`${matchIndex}-${url}`} href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-800">{emailLinkLabel(url)}</a>);
    if (rawUrl.length > url.length) parts.push(rawUrl.slice(url.length));
    lastIndex = matchIndex + rawUrl.length;
  }
  parts.push(text.slice(lastIndex));
  return <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere]">{parts}</div>;
}
