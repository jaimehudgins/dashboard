import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  searchCurriculumRepo,
  recentCommits,
  isGithubConfigured,
  curriculumRepo,
} from "@/lib/github";

// GET /api/curriculum-repo/search?q=...  (empty q → recent commits)
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isGithubConfigured) {
    return NextResponse.json({ configured: false });
  }
  const q = new URL(req.url).searchParams.get("q") || "";
  try {
    if (q.trim()) {
      const results = await searchCurriculumRepo(q, 30);
      return NextResponse.json({ configured: true, repo: curriculumRepo, results });
    }
    const recent = await recentCommits(12);
    return NextResponse.json({ configured: true, repo: curriculumRepo, recent });
  } catch (err) {
    console.error("Curriculum repo search error:", err);
    return NextResponse.json(
      { configured: true, error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 },
    );
  }
}
