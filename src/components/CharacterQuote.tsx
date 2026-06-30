"use client";

import React, { useEffect, useState } from "react";

// West Wing flavor: each feature is named for a character; the page carries one
// of their lines. Rotates deterministically per day.
const QUOTES: Record<string, { name: string; lines: string[] }> = {
  donna: {
    name: "Donna",
    lines: [
      "You have forty unread, three that matter, and one you're avoiding.",
      "I sorted it. You're welcome.",
      "Read these before you reply to any of them.",
    ],
  },
  charlie: {
    name: "Charlie",
    lines: [
      "Sir, you have four minutes.",
      "I'll get you where you need to be, on time.",
      "Your next one started two minutes ago. This way.",
    ],
  },
  margaret: {
    name: "Margaret",
    lines: [
      "I took notes. I always take notes.",
      "Tell me what you know.",
      "I'll have the summary on your desk before you're back.",
    ],
  },
  leo: {
    name: "Leo",
    lines: [
      "I've been here before. I know the way out.",
      "Act as if ye have faith, and faith shall be given to you.",
      "We're going to do this together.",
    ],
  },
  sam: {
    name: "Sam",
    lines: [
      "Words, when spoken for the sake of performance, are music.",
      "It's not enough to be right. You have to say it well.",
      "Education is the silver bullet.",
    ],
  },
  mrsl: {
    name: "Mrs. Landingham",
    lines: [
      "I know where everything is.",
      "It's right where you left it, dear.",
      "Did you really think I wouldn't have a copy?",
    ],
  },
  cj: {
    name: "CJ",
    lines: [
      "Here's what you need to know before it breaks.",
      "I read everything so you don't have to.",
      "Full lid? Not while the field's still moving.",
    ],
  },
};

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

export default function CharacterQuote({
  character,
}: {
  character: keyof typeof QUOTES;
}) {
  const [line, setLine] = useState<string>("");
  const c = QUOTES[character];

  useEffect(() => {
    if (!c) return;
    setLine(c.lines[dayOfYear(new Date()) % c.lines.length]);
  }, [c]);

  if (!c || !line) return null;
  return (
    <p className="text-sm italic text-slate-400 mt-0.5">
      &ldquo;{line}&rdquo;{" "}
      <span className="not-italic text-slate-300">— {c.name}</span>
    </p>
  );
}
