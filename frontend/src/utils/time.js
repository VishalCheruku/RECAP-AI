import { useEffect, useState } from "react";

export function createTimestamp() {
  return new Date().toISOString();
}

export function ensureTimestamp(entry) {
  if (!entry) {
    return entry;
  }

  return {
    ...entry,
    occurred_at: entry.occurred_at || createTimestamp(),
  };
}

export function ensureTimestampList(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.map(ensureTimestamp);
}

export function formatRelativeTime(timestamp, now = Date.now()) {
  if (!timestamp) {
    return "just now";
  }

  const seconds = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 1000));
  if (seconds <= 4) {
    return "just now";
  }
  if (seconds < 60) {
    return `${seconds} sec ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) {
    return "1 min ago";
  }

  return `${minutes} min ago`;
}

export function formatExactTime(timestamp) {
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function useRelativeTimeNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [intervalMs]);

  return now;
}
