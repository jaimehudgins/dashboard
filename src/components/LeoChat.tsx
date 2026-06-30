"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Loader2, Wrench, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Tailwind preflight strips list/heading styling, so restore it per element.
const mdComponents = {
  p: (p: any) => <p className="mb-2 last:mb-0" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1" {...p} />,
  li: (p: any) => <li className="leading-snug" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-slate-900" {...p} />,
  em: (p: any) => <em className="italic" {...p} />,
  a: (p: any) => (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-600 underline"
      {...p}
    />
  ),
  h1: (p: any) => <h1 className="text-base font-bold mt-3 mb-1" {...p} />,
  h2: (p: any) => <h2 className="text-sm font-bold mt-3 mb-1" {...p} />,
  h3: (p: any) => <h3 className="text-sm font-semibold mt-2 mb-1" {...p} />,
  code: (p: any) => (
    <code className="bg-slate-100 rounded px-1 py-0.5 text-xs font-mono" {...p} />
  ),
  blockquote: (p: any) => (
    <blockquote className="border-l-2 border-slate-200 pl-3 text-slate-600 my-2" {...p} />
  ),
};

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
}

const SUGGESTIONS = [
  "What's on my plate today?",
  "When's my next meeting with Rasha?",
  "Add a task to follow up with LEAD",
  "What do you know about my schedule preferences?",
];

export default function LeoChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const todayKey = `leo.chat.${new Date().toISOString().slice(0, 10)}`;

  // Keep today's conversation across reloads; older days are cleared (EOD reset).
  useEffect(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("leo.chat.") && k !== todayKey)
          localStorage.removeItem(k);
      }
      const saved = localStorage.getItem(todayKey);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* ignore storage errors */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (messages.length) localStorage.setItem(todayKey, JSON.stringify(messages));
      else localStorage.removeItem(todayKey);
    } catch {
      /* ignore */
    }
  }, [messages, todayKey]);

  const clearChat = () => setMessages([]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    const next: ChatMsg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Leo couldn't respond");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, toolsUsed: data.toolsUsed },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 bg-slate-900 rounded-xl flex items-center justify-center">
          <MessageSquare className="text-white" size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leo</h1>
          <p className="text-slate-500 text-sm">What can I do for you?</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="ml-auto text-xs font-medium text-slate-400 hover:text-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-4 pr-1"
      >
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-sm text-slate-600 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-full px-3 py-1.5 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                m.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-slate-200 text-slate-800"
              }`}
            >
              {m.role === "user" ? (
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {m.content}
                </div>
              ) : (
                <div className="text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {m.content}
                  </ReactMarkdown>
                </div>
              )}
              {m.toolsUsed && m.toolsUsed.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100 text-xs text-slate-400">
                  <Wrench size={11} />
                  {m.toolsUsed.join(", ")}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 flex items-center gap-2 text-sm text-slate-400">
              <Loader2 size={14} className="animate-spin" />
              Leo is thinking…
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-4 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Ask Leo anything…"
          className="flex-1 resize-none border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 max-h-40"
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors flex-shrink-0"
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
