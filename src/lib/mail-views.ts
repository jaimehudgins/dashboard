// Leo-managed inbox buckets, backed by real Gmail labels so unread counts come
// from Gmail for free and the labels are visible in Gmail too.

export const LEO_LABEL_NAMES = {
  current: "Leo/Current Partner",
  potential: "Leo/Potential",
  newsletter: "Leo/Newsletter",
  willow: "Leo/Willow",
  notifications: "Leo/Notifications",
} as const;

export type LeoBucket = keyof typeof LEO_LABEL_NAMES;

export const VIEWS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "current", label: "Current Partners" },
  { key: "potential", label: "Potential" },
  { key: "willow", label: "Willow" },
  { key: "newsletter", label: "Newsletters" },
  { key: "notifications", label: "Notifications" },
  { key: "other", label: "Other" },
];

// Auto-generated notification mail (calendar invites/responses, Drive/Docs
// shares + comments, forms) — recognized by sender or subject, regardless of
// who triggered it, so it can be decluttered out of the main buckets.
export function isNotificationMail(from: string, subject: string): boolean {
  const f = from.toLowerCase();
  const s = subject.trim().toLowerCase();
  if (
    /(calendar-notification|drive-shares-noreply|comments-noreply|forms-receipts-noreply|docs-noreply|no-?reply)@/.test(
      f,
    ) &&
    /google\.com/.test(f)
  )
    return true;
  if (
    /^(accepted|declined|tentative|invitation|updated invitation|canceled event|cancelled|declined with comment|accepted with comment|new comment|re: invitation):/.test(
      s,
    )
  )
    return true;
  if (/\bshared (a document|an item|a file|a folder|".*")\b/.test(s)) return true;
  return false;
}

export function emailDomain(from: string): string {
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1] : from).trim();
  const at = addr.indexOf("@");
  return at >= 0 ? addr.slice(at + 1).trim().toLowerCase() : "";
}
