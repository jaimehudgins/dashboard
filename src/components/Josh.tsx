"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Bell,
  ExternalLink,
  Hash,
  Loader2,
  Moon,
  Search,
  Slack,
  Sunrise,
} from "lucide-react";
import CharacterQuote from "./CharacterQuote";
import { SlackHit } from "@/lib/slack";

export default function Josh() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SlackHit[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<{
    notificationsConfigured: boolean;
    storeConfigured: boolean;
    inboundConfigured: boolean;
    inboundStoreConfigured: boolean;
    schedule?: { morning: string; evening: string; urgentScan: string };
  } | null>(null);
  const [notificationAction, setNotificationAction] = useState<string | null>(
    null,
  );
  const [notificationMessage, setNotificationMessage] = useState<string | null>(
    null,
  );
  const [briefPreview, setBriefPreview] = useState<{
    period: "morning" | "evening";
    content: string;
  } | null>(null);

  const loadNotificationStatus = useCallback(() => {
    fetch("/api/slack/notifications", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load Slack status");
        return data;
      })
      .then((data) => setNotificationStatus(data))
      .catch((requestError) => setNotificationMessage(requestError.message));
  }, []);

  useEffect(() => {
    loadNotificationStatus();
  }, [loadNotificationStatus]);

  const notificationRequest = async (
    action: "test" | "preview" | "send",
    period?: "morning" | "evening",
  ) => {
    setNotificationAction(`${action}:${period || "connection"}`);
    if (action === "preview" && period) {
      setBriefPreview(null);
      setNotificationMessage(
        `Gathering Leo's sources for the ${period} preview. This may take 15–30 seconds.`,
      );
    } else {
      setNotificationMessage(null);
    }
    try {
      const response = await fetch("/api/slack/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, period }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Slack action failed");
      if (action === "preview" && period) {
        setBriefPreview({ period, content: data.content });
        setNotificationMessage(
          data.errors?.length
            ? `Preview created with ${data.errors.length} unavailable source(s).`
            : "Preview created from current Leo data.",
        );
      } else {
        setNotificationMessage(
          data.result === "duplicate"
            ? "That update was already sent today."
            : "Slack message sent.",
        );
        loadNotificationStatus();
      }
    } catch (requestError) {
      setNotificationMessage(
        requestError instanceof Error ? requestError.message : "Slack action failed",
      );
    } finally {
      setNotificationAction(null);
    }
  };

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

      <section className="mb-6 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white p-2 text-indigo-600 shadow-sm">
            <Bell size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-slate-900">Leo Slack updates</h2>
            <p className="mt-1 text-sm text-slate-600">
              Urgent partner-email alerts plus a morning plan and end-of-day
              recap.
            </p>

            {!notificationStatus ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" /> Checking the connection…
              </p>
            ) : !notificationStatus.notificationsConfigured ? (
              <div className="mt-4 rounded-xl border border-dashed border-indigo-200 bg-white p-4 text-sm text-slate-600">
                Add <code>SLACK_BOT_TOKEN</code> and either{" "}
                <code>SLACK_ALERT_USER_ID</code> or{" "}
                <code>SLACK_ALERT_CHANNEL_ID</code> in Vercel, then redeploy.
                The bot needs <code>chat:write</code> and <code>im:write</code>.
              </div>
            ) : !notificationStatus.storeConfigured ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Run <code>leo-notifications.sql</code> in dashboard Supabase to
                enable deduplication and daily snapshots.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                  <span className="rounded-lg bg-white px-3 py-2">
                    <Sunrise size={13} className="mr-1 inline text-amber-500" />
                    {notificationStatus.schedule?.morning}
                  </span>
                  <span className="rounded-lg bg-white px-3 py-2">
                    <Moon size={13} className="mr-1 inline text-indigo-500" />
                    {notificationStatus.schedule?.evening}
                  </span>
                  <span className="rounded-lg bg-white px-3 py-2">
                    <Bell size={13} className="mr-1 inline text-rose-500" />
                    Alerts {notificationStatus.schedule?.urgentScan.toLowerCase()}
                  </span>
                </div>
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    notificationStatus.inboundConfigured &&
                    notificationStatus.inboundStoreConfigured
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  {notificationStatus.inboundConfigured &&
                  notificationStatus.inboundStoreConfigured
                    ? "Direct messages to Leo are ready."
                    : "Inbound Slack still needs its signing secret, message.im subscription, and leo-slack-inbound.sql migration."}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void notificationRequest("test")}
                    disabled={notificationAction !== null}
                    className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {notificationAction === "test:connection" ? "Sending…" : "Send test"}
                  </button>
                  <button
                    onClick={() => void notificationRequest("preview", "morning")}
                    disabled={notificationAction !== null}
                    aria-busy={notificationAction === "preview:morning"}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                  >
                    {notificationAction === "preview:morning" ? (
                      <>
                        <Loader2 size={13} className="animate-spin" /> Building morning…
                      </>
                    ) : (
                      "Preview morning"
                    )}
                  </button>
                  <button
                    onClick={() => void notificationRequest("preview", "evening")}
                    disabled={notificationAction !== null}
                    aria-busy={notificationAction === "preview:evening"}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                  >
                    {notificationAction === "preview:evening" ? (
                      <>
                        <Loader2 size={13} className="animate-spin" /> Building evening…
                      </>
                    ) : (
                      "Preview evening"
                    )}
                  </button>
                </div>
                {briefPreview && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">
                      {briefPreview.content}
                    </pre>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Send this ${briefPreview.period} update to Slack now?`,
                          )
                        ) {
                          void notificationRequest("send", briefPreview.period);
                        }
                      }}
                      disabled={notificationAction !== null}
                      className="mt-4 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Generate and send now
                    </button>
                  </div>
                )}
              </div>
            )}
            {notificationMessage && (
              <p className="mt-3 text-xs font-medium text-slate-600">
                {notificationMessage}
              </p>
            )}
          </div>
        </div>
      </section>

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
              Add the <strong>user token scope</strong>{" "}
              <code className="bg-white px-1 rounded">search:read</code> and
              install it to the workspace.
            </li>
            <li>
              Copy the user token (<code className="bg-white px-1 rounded">xoxp-…</code>
              ) into <code className="bg-white px-1 rounded">SLACK_SEARCH_TOKEN</code>{" "}
              in .env.local + Vercel, then redeploy. The legacy{" "}
              <code className="bg-white px-1 rounded">SLACK_TOKEN</code> still works.
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
