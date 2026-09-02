"use client";

import React, { useCallback, useEffect, useState } from "react";

export default function AttentionNavBadge() {
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    fetch("/api/attention/summary")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { pendingReview?: number };
      })
      .then((data) => setCount(data?.pendingReview ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 60_000);
    window.addEventListener("leo:attention-updated", load);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("leo:attention-updated", load);
    };
  }, [load]);

  if (count === 0) return null;

  return (
    <span
      className="ml-auto min-w-5 rounded-full bg-amber-100 px-1.5 py-0.5 text-center text-[10px] font-bold text-amber-700"
      aria-label={`${count} meeting commitment${count === 1 ? "" : "s"} to review`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
