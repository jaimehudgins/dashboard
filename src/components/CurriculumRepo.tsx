"use client";

import React, { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Github,
  Search,
  Loader2,
  FileCode,
  GitCommit,
  ExternalLink,
} from "lucide-react";
import { RepoHit, RepoCommit } from "@/lib/github";

export default function CurriculumRepo() {
  const [query, setQuery] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [repo, setRepo] = useState("");
  const [results, setResults] = useState<RepoHit[]>([]);
  const [recent, setRecent] = useState<RepoCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((q: string) => {
    setLoading(true);
    setError(null);
    setSearched(!!q.trim());
    fetch(`/api/curriculum-repo/search?q=${encodeURIComponent(q)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed");
        return d;
      })
      .then((d) => {
        setConfigured(d.configured);
        setRepo(d.repo || "");
        setResults(d.results || []);
        if (d.recent) setRecent(d.recent);
        if (d.error) setError(d.error);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    run("");
  }, [run]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Github className="text-slate-700" size={22} />
          Curriculum Repo
        </h1>
        <p className="text-slate-500 mt-1">
          {repo
            ? `Search lesson content + see recent changes in ${repo}.`
            : "Search lesson content across the curriculum repo."}
        </p>
      </div>

      {configured === false ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-slate-600">
          <h2 className="font-semibold text-slate-800 mb-2">Connect the repo</h2>
          <ol className="text-sm space-y-1.5 list-decimal pl-5">
            <li>
              Create a GitHub personal access token with{" "}
              <strong>read access</strong> to the curriculum repo (fine-grained:
              Contents = read).
            </li>
            <li>
              Set <code className="bg-white px-1 rounded">GITHUB_TOKEN</code> and{" "}
              <code className="bg-white px-1 rounded">
                GITHUB_CURRICULUM_REPO
              </code>{" "}
              (as <code className="bg-white px-1 rounded">owner/repo</code>) in
              .env.local + Vercel, then redeploy.
            </li>
          </ol>
        </div>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(query);
            }}
            className="relative mb-5"
          >
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search lesson content, agents, skills…"
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </form>

          {error && (
            <p className="text-sm text-red-600 mb-4 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
              <Loader2 size={18} className="animate-spin" /> Loading…
            </div>
          ) : searched ? (
            results.length === 0 ? (
              <div className="text-center text-slate-400 py-12">No matches.</div>
            ) : (
              <div className="space-y-1.5">
                {results.map((r) => (
                  <a
                    key={r.path}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-indigo-200 hover:shadow-sm transition-all"
                  >
                    <FileCode size={16} className="text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {r.name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{r.path}</p>
                    </div>
                    <ExternalLink
                      size={13}
                      className="text-slate-300 group-hover:text-slate-500 flex-shrink-0"
                    />
                  </a>
                ))}
              </div>
            )
          ) : (
            <div>
              <p className="text-xs text-slate-400 mb-2">Recent changes</p>
              <div className="space-y-1.5">
                {recent.map((c) => (
                  <a
                    key={c.sha}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-indigo-200 transition-all"
                  >
                    <GitCommit size={15} className="text-slate-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">
                        {c.message}
                      </p>
                      <p className="text-xs text-slate-400">
                        {c.author}
                        {c.date && ` · ${format(new Date(c.date), "MMM d")}`} ·{" "}
                        {c.sha}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
