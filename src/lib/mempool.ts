import { normalizeTransaction, type MempoolTransaction } from "./transactions";

export type MempoolStats = {
  count: number;
  vsize: number;
  totalFee: number;
};

export type MempoolSnapshot = {
  transactions: MempoolTransaction[];
  stats: MempoolStats;
  fetchedAt: string;
};

export async function fetchMempoolSnapshot(
  fetcher: typeof fetch,
  baseUrl: string,
): Promise<MempoolSnapshot> {
  const base = baseUrl.replace(/\/$/, "");
  const [recentResponse, statsResponse] = await Promise.all([
    fetcher(`${base}/mempool/recent`, { cache: "no-store" }),
    fetcher(`${base}/mempool`, { cache: "no-store" }),
  ]);
  if (!recentResponse.ok || !statsResponse.ok) {
    throw new Error("Mempool source unavailable");
  }
  const [recent, rawStats] = await Promise.all([recentResponse.json(), statsResponse.json()]);
  const transactions = Array.isArray(recent)
    ? recent.map((item) => normalizeTransaction(item)).filter((item): item is MempoolTransaction => Boolean(item))
    : [];
  return {
    transactions,
    stats: {
      count: safeNumber(rawStats?.count),
      vsize: safeNumber(rawStats?.vsize),
      totalFee: safeNumber(rawStats?.total_fee),
    },
    fetchedAt: new Date().toISOString(),
  };
}

function safeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
