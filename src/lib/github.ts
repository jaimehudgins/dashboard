// Minimal GitHub client for the curriculum repo. Activates when GITHUB_TOKEN +
// GITHUB_CURRICULUM_REPO ("owner/repo") are set. v1 uses GitHub's live code
// search (no local indexing pipeline yet) plus recent commits.

const TOKEN = process.env.GITHUB_TOKEN?.trim();
const REPO = process.env.GITHUB_CURRICULUM_REPO?.trim();

export const isGithubConfigured = !!(TOKEN && REPO);
export const curriculumRepo = REPO || "";

async function ghFetch(path: string): Promise<any> {
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
  return res.json();
}

export interface RepoHit {
  name: string;
  path: string;
  url: string;
}

export async function searchCurriculumRepo(
  query: string,
  max = 25,
): Promise<RepoHit[]> {
  const q = encodeURIComponent(`${query} repo:${REPO}`);
  const data = await ghFetch(`/search/code?q=${q}&per_page=${Math.min(max, 30)}`);
  return (data.items || []).map((it: any) => ({
    name: it.name,
    path: it.path,
    url: it.html_url,
  }));
}

export interface RepoCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export async function recentCommits(max = 12): Promise<RepoCommit[]> {
  const data = await ghFetch(`/repos/${REPO}/commits?per_page=${Math.min(max, 30)}`);
  return (data || []).map((c: any) => ({
    sha: (c.sha || "").slice(0, 7),
    message: (c.commit?.message || "").split("\n")[0],
    author: c.commit?.author?.name || "",
    date: c.commit?.author?.date || "",
    url: c.html_url || "",
  }));
}
