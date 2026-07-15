import { describe, expect, it } from "vitest";
import {
  downsampleHistoryPoints,
  historyRangeStart,
  normalizeHistoryRange,
  parseHistoryLimit,
  parseHistoryPoint,
  snapshotToHistoryPoint,
  transactionRates,
  type MempoolHistoryPoint,
} from "./history";
import type { MempoolSnapshot } from "./mempool";

const basePoint: MempoolHistoryPoint = {
  fetchedAt: "2026-07-15T00:00:00.000Z",
  transactions: 10_000,
  vsize: 8_000_000,
  totalFee: 500_000,
  fastestFee: 8,
  halfHourFee: 6,
  hourFee: 4,
  economyFee: 2,
  minimumFee: 1,
  blockHeight: 958_000,
  blockTxCount: 3_500,
  blockSize: 1_500_000,
  blockTimestamp: 1_783_000_000,
};

describe("historical mempool metrics", () => {
  it("converts a live snapshot into a compact historical point", () => {
    const snapshot: MempoolSnapshot = {
      transactions: [],
      stats: { count: 12_345, vsize: 9_876_543, totalFee: 765_432 },
      fees: { fastestFee: 9, halfHourFee: 7, hourFee: 5, economyFee: 3, minimumFee: 1 },
      block: { height: 958_001, txCount: 4_100, size: 1_610_000, timestamp: 1_783_000_100 },
      fetchedAt: "2026-07-15T00:01:00.000Z",
    };

    expect(snapshotToHistoryPoint(snapshot)).toEqual({
      fetchedAt: snapshot.fetchedAt,
      transactions: 12_345,
      vsize: 9_876_543,
      totalFee: 765_432,
      fastestFee: 9,
      halfHourFee: 7,
      hourFee: 5,
      economyFee: 3,
      minimumFee: 1,
      blockHeight: 958_001,
      blockTxCount: 4_100,
      blockSize: 1_610_000,
      blockTimestamp: 1_783_000_100,
    });
  });

  it("normalizes range and result limit inputs", () => {
    const now = Date.parse("2026-07-15T00:00:00.000Z");
    expect(normalizeHistoryRange("7d")).toBe("7d");
    expect(normalizeHistoryRange("forever")).toBe("24h");
    expect(historyRangeStart("1h", now)).toBe(now - 3_600_000);
    expect(parseHistoryLimit("4")).toBe(30);
    expect(parseHistoryLimit("5000")).toBe(1000);
    expect(parseHistoryLimit("invalid")).toBe(360);
  });

  it("downsamples evenly while preserving the first and latest points", () => {
    const points = Array.from({ length: 10 }, (_, index) => ({
      ...basePoint,
      fetchedAt: `2026-07-15T00:0${index}:00.000Z`,
      transactions: index,
    }));
    const sampled = downsampleHistoryPoints(points, 4);
    expect(sampled.map((point) => point.transactions)).toEqual([0, 3, 6, 9]);
  });

  it("derives non-negative transaction rates across block resets", () => {
    const points = [
      basePoint,
      { ...basePoint, fetchedAt: "2026-07-15T00:01:00.000Z", transactions: 10_120 },
      { ...basePoint, fetchedAt: "2026-07-15T00:02:00.000Z", transactions: 8_000, blockHeight: 958_001 },
    ];
    expect(transactionRates(points)).toEqual([0, 2, 0]);
  });

  it("rejects malformed persisted points", () => {
    expect(parseHistoryPoint(basePoint)).toEqual(basePoint);
    expect(parseHistoryPoint({ ...basePoint, vsize: "large" })).toBeNull();
    expect(parseHistoryPoint({ ...basePoint, fetchedAt: "invalid" })).toBeNull();
  });
});
