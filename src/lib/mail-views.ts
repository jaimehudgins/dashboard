// Leo-managed inbox buckets, backed by real Gmail labels so unread counts come
// from Gmail for free and the labels are visible in Gmail too.

export const LEO_LABEL_NAMES = {
  current: "Leo/Current Partner",
  potential: "Leo/Potential",
  newsletter: "Leo/Newsletter",
  willow: "Leo/Willow",
} as const;

export type LeoBucket = keyof typeof LEO_LABEL_NAMES;

export const VIEWS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "current", label: "Current Partners" },
  { key: "potential", label: "Potential" },
  { key: "newsletter", label: "Newsletters" },
  { key: "willow", label: "Willow" },
  { key: "other", label: "Other" },
];

export function emailDomain(from: string): string {
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1] : from).trim();
  const at = addr.indexOf("@");
  return at >= 0 ? addr.slice(at + 1).trim().toLowerCase() : "";
}
