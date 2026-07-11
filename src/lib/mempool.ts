import {
  normalizeTransactionDetail,
  type BlockSummary,
  type FeeRecommendations,
  type TransactionDetail,
} from "./experience";
import { normalizeTransaction, type MempoolTransaction } from "./transactions";

export type MempoolStats = {
  count: number;
  vsize: number;
  totalFee: number;
};

export type MempoolSnapshot = {
  transactions: MempoolTransaction[];
  stats: MempoolStats;
  fees: FeeRecommendations;
  block: BlockSummary;
  fetchedAt: string;
};

export async function fetchMempoolSnapshot(
  fetcher: typeof fetch,
  baseUrl: string,
): Promise<MempoolSnapshot> {
  const base = baseUrl.replace(/\/$/, "");
  const responses = await Promise.all([
    fetcher(`${base}/mempool/recent`, { cache: "no-store" }),
    fetcher(`${base}/mempool`, { cache: "no-store" }),
    fetcher(`${base}/v1/fees/recommended`, { cache: "no-store" }),
    fetcher(`${base}/v1/blocks`, { cache: "no-store" }),
  ]);
  if (responses.some((response) => !response.ok)) {
    throw new Error("Mempool source unavailable");
  }
  const [recent, rawStats, rawFees, rawBlocks] = await Promise.all(
    responses.map((response) => response.json()),
  );
  const transactions = Array.isArray(recent)
    ? recent.map((item) => normalizeTransaction(item)).filter((item): item is MempoolTransaction => Boolean(item))
    : [];
  const latestBlock = Array.isArray(rawBlocks) && rawBlocks.length > 0 ? rawBlocks[0] : {};
  return {
    transactions,
    stats: {
      count: safeNumber(rawStats?.count),
      vsize: safeNumber(rawStats?.vsize),
      totalFee: safeNumber(rawStats?.total_fee),
    },
    fees: {
      fastestFee: safeNumber(rawFees?.fastestFee),
      halfHourFee: safeNumber(rawFees?.halfHourFee),
      hourFee: safeNumber(rawFees?.hourFee),
      economyFee: safeNumber(rawFees?.economyFee),
      minimumFee: safeNumber(rawFees?.minimumFee),
    },
    block: {
      id: typeof latestBlock.id === "string" ? latestBlock.id : undefined,
      height: safeNumber(latestBlock.height),
      txCount: safeNumber(latestBlock.tx_count),
      size: safeNumber(latestBlock.size),
      timestamp: safeNumber(latestBlock.timestamp),
    },
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchTransactionDetail(
  fetcher: typeof fetch,
  baseUrl: string,
  txid: string,
): Promise<TransactionDetail> {
  if (!/^[0-9a-f]{64}$/i.test(txid)) throw new Error("Invalid transaction id");
  const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/tx/${txid}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Transaction unavailable");
  return normalizeTransactionDetail(await response.json());
}

function safeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
