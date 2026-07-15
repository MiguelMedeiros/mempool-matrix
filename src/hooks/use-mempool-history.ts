"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  HistoryRange,
  MempoolHistoryPoint,
  MempoolHistoryResponse,
} from "@/lib/history";

export function useMempoolHistory(range: HistoryRange, limit = 360) {
  const [points, setPoints] = useState<MempoolHistoryPoint[]>([]);
  const [sampleIntervalMs, setSampleIntervalMs] = useState(60_000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/mempool/history?range=${range}&limit=${limit}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("history-unavailable");
      const history = await response.json() as MempoolHistoryResponse;
      setPoints(history.points);
      setSampleIntervalMs(history.sampleIntervalMs);
      setError(null);
    } catch (nextError) {
      if (nextError instanceof DOMException && nextError.name === "AbortError") return;
      setError("Historical data is temporarily unavailable.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [limit, range]);

  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => void refresh(controller.signal), 0);
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      controller.abort();
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { points, sampleIntervalMs, loading, error, refresh };
}
