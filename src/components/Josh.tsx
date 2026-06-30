"use client";

import React, { useCallback, useState } from "react";
import { Hash, Search, Loader2, ExternalLink, Slack } from "lucide-react";
import CharacterQuote from "./CharacterQuote";
import { SlackHit } from "@/lib/slack";

export default function Josh() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SlackHit[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    fetch(`/api/slack/search?q=${encodeURIComponent(q)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Search failed");
        return d;
      })
      .then((d) => {
        setConfigured(d.configured);
        setHits(d.hits || []);
        if (d.error) setError(d.error);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Slack className="text-indigo-500" size={22} />
          Josh
        </h1>
        <CharacterQuote character="josh" />
      </div>

      {configured === false ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-slate-600">
          <h2 className="font-semibold text-slate-800 mb-2">Connect Slack</h2>
          <p className="text-sm mb-3">
            Josh searches your Willow Slack. To turn it on, add a Slack token to
            the environment:
          </p>
          <ol className="text-sm space-y-1.5 list-decimal pl-5">
            <li>
              Create a Slack app for your workspace at api.slack.com/apps.
            </li>
            <li>
              Add a <strong>user token scope</strong> of{" "}
              <code className="bg-white px-1 rounded">search:read</code> (and{" "}
              <code className="bg-white px-1 rounded">chat:write</code> later for
              drafting). Install to the workspace.
            </li>
            <li>
              Copy the user token (<code className="bg-white px-1 rounded">xoxp-…</code>
              ) into <code className="bg-white px-1 rounded">SLACK_TOKEN</code> in
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
              placeholder="Search Slack — e.g. 'gradebook from:ryan'"
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
              <Loader2 size={18} className="animate-spin" /> Searching…
            </div>
          ) : searched && hits.length === 0 ? (
            <div className="text-center text-slate-400 py-12">No matches.</div>
          ) : (
            <div className="space-y-2">
              {hits.map((h, i) => (
                <a
                  key={i}
                  href={h.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                    {h.channel && (
                      <span className="inline-flex items-center gap-0.5">
                        <Hash size={11} />
                        {h.channel}
                      </span>
                    )}
                    {h.user && <span>· {h.user}</span>}
                    <ExternalLink
                      size={11}
                      className="ml-auto text-slate-300 group-hover:text-slate-500"
                    />
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-3">{h.text}</p>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
