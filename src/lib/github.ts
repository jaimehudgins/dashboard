// Minimal GitHub client for the curriculum repo. Activates when GITHUB_TOKEN +
// GITHUB_CURRICULUM_REPO ("owner/repo") are set. v1 uses GitHub's live code
// search (no local indexing pipeline yet), file reads, and recent commits.

import { Buffer } from "node:buffer";

const TOKEN = process.env.GITHUB_TOKEN?.trim();
const REPO = process.env.GITHUB_CURRICULUM_REPO?.trim();

export const isGithubConfigured = !!(TOKEN && REPO);
export const curriculumRepo = REPO || "";

async function ghFetch<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export interface RepoHit {
  name: string;
  path: string;
  url: string;
}

interface RepoContentResponse {
  type?: string;
  encoding?: string;
  content?: string;
  size?: number;
  html_url?: string;
}

export async function searchCurriculumRepo(
  query: string,
  max = 25,
): Promise<RepoHit[]> {
  const q = encodeURIComponent(`${query} repo:${REPO}`);
  const data = await ghFetch<{
    items?: Array<{ name?: string; path?: string; html_url?: string }>;
  }>(`/search/code?q=${q}&per_page=${Math.min(max, 30)}`);
  return (data.items || []).map((it) => ({
    name: it.name,
    path: it.path,
    url: it.html_url,
  })).filter(
    (hit): hit is RepoHit =>
      Boolean(hit.name && hit.path && hit.url),
  );
}

export async function readCurriculumFile(
  path: string,
  maxChars = 12_000,
): Promise<{ text: string; url: string }> {
  const data = await ghFetch<RepoContentResponse>(
    `/repos/${REPO}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  );
  if (data.type !== "file" || data.encoding !== "base64" || !data.content) {
    throw new Error("GitHub result is not a readable file");
  }
  if ((data.size ?? 0) > 2 * 1024 * 1024) {
    throw new Error("Curriculum file is too large to read safely");
  }
  const text = Buffer.from(data.content.replace(/\s/g, ""), "base64")
    .toString("utf8")
    .trim();
  if (!text) throw new Error("Curriculum file is empty");
  return {
    text: text.slice(0, maxChars),
    url:
      data.html_url ||
      `https://github.com/${REPO}/blob/main/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
  };
}

export interface RepoCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export async function recentCommits(max = 12): Promise<RepoCommit[]> {
  const data = await ghFetch<
    Array<{
      sha?: string;
      html_url?: string;
      commit?: {
        message?: string;
        author?: { name?: string; date?: string };
      };
    }>
  >(`/repos/${REPO}/commits?per_page=${Math.min(max, 30)}`);
  return data.map((c) => ({
    sha: (c.sha || "").slice(0, 7),
    message: (c.commit?.message || "").split("\n")[0],
    author: c.commit?.author?.name || "",
    date: c.commit?.author?.date || "",
    url: c.html_url || "",
  }));
}
