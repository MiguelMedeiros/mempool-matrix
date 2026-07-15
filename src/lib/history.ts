import type { MempoolSnapshot } from "./mempool";

export const HISTORY_RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;

export type HistoryRange = (typeof HISTORY_RANGES)[number];

export type MempoolHistoryPoint = {
  fetchedAt: string;
  transactions: number;
  vsize: number;
  totalFee: number;
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
  blockHeight: number;
  blockTxCount: number;
  blockSize: number;
  blockTimestamp: number;
};

export type MempoolHistoryResponse = {
  range: HistoryRange;
  from: string;
  to: string;
  sampleIntervalMs: number;
  points: MempoolHistoryPoint[];
};

const RANGE_MILLISECONDS: Record<HistoryRange, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function snapshotToHistoryPoint(snapshot: MempoolSnapshot): MempoolHistoryPoint {
  return {
    fetchedAt: snapshot.fetchedAt,
    transactions: snapshot.stats.count,
    vsize: snapshot.stats.vsize,
    totalFee: snapshot.stats.totalFee,
    fastestFee: snapshot.fees.fastestFee,
    halfHourFee: snapshot.fees.halfHourFee,
    hourFee: snapshot.fees.hourFee,
    economyFee: snapshot.fees.economyFee,
    minimumFee: snapshot.fees.minimumFee,
    blockHeight: snapshot.block.height,
    blockTxCount: snapshot.block.txCount,
    blockSize: snapshot.block.size,
    blockTimestamp: snapshot.block.timestamp,
  };
}

export function normalizeHistoryRange(value: unknown): HistoryRange {
  return typeof value === "string" && HISTORY_RANGES.includes(value as HistoryRange)
    ? value as HistoryRange
    : "24h";
}

export function historyRangeStart(range: HistoryRange, now = Date.now()): number {
  return now - RANGE_MILLISECONDS[range];
}

export function parseHistoryLimit(value: unknown, fallback = 360): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(1000, Math.max(30, parsed)) : fallback;
}

export function downsampleHistoryPoints(
  points: MempoolHistoryPoint[],
  limit: number,
): MempoolHistoryPoint[] {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  if (points.length <= normalizedLimit) return points;
  if (normalizedLimit === 1) return [points.at(-1)!];

  const step = (points.length - 1) / (normalizedLimit - 1);
  return Array.from(
    { length: normalizedLimit },
    (_, index) => points[Math.round(index * step)],
  );
}

export function transactionRates(points: MempoolHistoryPoint[]): number[] {
  return points.map((point, index) => {
    if (index === 0) return 0;
    const previous = points[index - 1];
    const elapsedSeconds = (Date.parse(point.fetchedAt) - Date.parse(previous.fetchedAt)) / 1000;
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
    return Math.max(0, Math.round(((point.transactions - previous.transactions) / elapsedSeconds) * 10) / 10);
  });
}

export function parseHistoryPoint(value: unknown): MempoolHistoryPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Partial<Record<keyof MempoolHistoryPoint, unknown>>;
  if (typeof point.fetchedAt !== "string" || !Number.isFinite(Date.parse(point.fetchedAt))) return null;

  const numberKeys: Array<Exclude<keyof MempoolHistoryPoint, "fetchedAt">> = [
    "transactions",
    "vsize",
    "totalFee",
    "fastestFee",
    "halfHourFee",
    "hourFee",
    "economyFee",
    "minimumFee",
    "blockHeight",
    "blockTxCount",
    "blockSize",
    "blockTimestamp",
  ];
  if (numberKeys.some((key) => typeof point[key] !== "number" || !Number.isFinite(point[key]))) {
    return null;
  }

  return point as MempoolHistoryPoint;
}
