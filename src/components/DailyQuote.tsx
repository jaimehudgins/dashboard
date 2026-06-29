"use client";

import React, { useEffect, useState } from "react";
import { Quote as QuoteIcon } from "lucide-react";
import { fetchQuotes } from "@/lib/database";
import { Quote } from "@/types";

// Day-of-year (1-366), used for a deterministic-per-date pick.
function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function DailyQuote() {
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    let active = true;
    fetchQuotes().then((quotes) => {
      if (!active || quotes.length === 0) return;
      // Deterministic-per-date: same quote all day, rotates over the set.
      const index = dayOfYear(new Date()) % quotes.length;
      setQuote(quotes[index]);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!quote) return null;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-sm">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <QuoteIcon className="text-white/70" size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-medium leading-relaxed">
            &ldquo;{quote.quote}&rdquo;
          </p>
          {quote.speaker && (
            <p className="text-sm text-white/60 mt-2">
              &mdash; {quote.speaker}
              {quote.context ? ` · ${quote.context}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
