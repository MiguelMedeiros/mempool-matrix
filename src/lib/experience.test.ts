import { describe, expect, it } from "vitest";
import {
  appendHistory,
  blockAnimationProgress,
  classifyFee,
  detectBlockEvent,
  detectHighlights,
  getPressure,
  normalizeMode,
  normalizeTransactionDetail,
  parseTransactionSearch,
  parseMatrixCommand,
  snapshotRate,
  type ExperienceSnapshot,
} from "./experience";

const baseSnapshot: ExperienceSnapshot = {
  fetchedAt: "2026-07-11T12:00:00.000Z",
  count: 10_000,
  vsize: 8_000_000,
  blockHeight: 957_580,
};

describe("mempool pressure", () => {
  it.each([
    [4_000_000, "calm", 0.15],
    [25_000_000, "active", 0.45],
    [75_000_000, "heavy", 0.75],
    [140_000_000, "critical", 1],
  ] as const)("maps %i virtual bytes to %s", (vsize, label, intensity) => {
    expect(getPressure(vsize)).toEqual({ label, intensity });
  });
});

describe("fee language", () => {
  const fees = { fastestFee: 20, halfHourFee: 12, hourFee: 8, economyFee: 3, minimumFee: 1 };

  it.each([
    [2, "low"],
    [9, "medium"],
    [14, "high"],
    [22, "priority"],
    [120, "extreme"],
  ] as const)("classifies %i sat/vB as %s", (rate, tier) => {
    expect(classifyFee(rate, fees)).toBe(tier);
  });
});

describe("block and history events", () => {
  it("does not animate a block before any block event has started", () => {
    expect(blockAnimationProgress(0, 3_000)).toBe(-1);
    expect(blockAnimationProgress(1_000, 4_000, 6_000)).toBe(0.5);
    expect(blockAnimationProgress(1_000, 8_000, 6_000)).toBe(-1);
  });

  it("emits a cinematic event only when block height advances", () => {
    expect(detectBlockEvent(957_580, { height: 957_581, txCount: 4690, size: 1_556_630, timestamp: 123 }))
      .toMatchObject({ height: 957_581, txCount: 4690 });
    expect(detectBlockEvent(957_581, { height: 957_581, txCount: 4690, size: 1, timestamp: 123 }))
      .toBeNull();
  });

  it("keeps a bounded timeline with newest snapshots last", () => {
    const history = Array.from({ length: 8 }, (_, index) => ({
      ...baseSnapshot,
      fetchedAt: `2026-07-11T12:00:${String(index).padStart(2, "0")}.000Z`,
      blockHeight: index,
    }));
    expect(appendHistory(history, { ...baseSnapshot, blockHeight: 99 }, 5).map((item) => item.blockHeight))
      .toEqual([4, 5, 6, 7, 99]);
  });

  it("calculates transaction arrival rate from snapshots", () => {
    const next = { ...baseSnapshot, fetchedAt: "2026-07-11T12:00:10.000Z", count: 10_070 };
    expect(snapshotRate(baseSnapshot, next)).toBe(7);
  });
});

describe("rare transaction highlights", () => {
  it("detects high-value, high-fee and structural transactions", () => {
    expect(detectHighlights({ value: 200_000_000, feeRate: 150, inputs: 48, outputs: 75 })).toEqual([
      "high-value",
      "high-fee",
      "consolidation",
      "fan-out",
    ]);
  });
});

describe("transaction inspector and modes", () => {
  it("recognizes hidden Matrix commands without confusing txids", () => {
    expect(parseMatrixCommand("follow the white rabbit")).toBe("rabbit");
    expect(parseMatrixCommand("there is no spoon")).toBe("spoon");
    expect(parseMatrixCommand("red pill")).toBe("red-pill");
    expect(parseMatrixCommand("blue pill")).toBe("blue-pill");
    expect(parseMatrixCommand("zion")).toBe("zion");
    expect(parseMatrixCommand("ab".repeat(32))).toBeNull();
  });

  it("extracts a txid from raw text or a local explorer URL", () => {
    const txid = "ab".repeat(32);
    expect(parseTransactionSearch(`  ${txid.toUpperCase()}  `)).toBe(txid);
    expect(parseTransactionSearch(`http://100.67.121.90:3000/tx/${txid}?source=live`)).toBe(txid);
    expect(parseTransactionSearch("not a transaction")).toBeNull();
  });

  it("normalizes confirmation block fields for searched transactions", () => {
    const detail = normalizeTransactionDetail({
      txid: "b".repeat(64), fee: 100, weight: 400, vin: [], vout: [],
      status: { confirmed: true, block_height: 957600, block_time: 1783789999 },
    });
    expect(detail).toMatchObject({ confirmed: true, blockHeight: 957600, blockTime: 1783789999 });
  });

  it("normalizes detail fields and detects opt-in RBF", () => {
    const detail = normalizeTransactionDetail({
      txid: "a".repeat(64),
      fee: 800,
      weight: 800,
      vin: [{ sequence: 0xfffffffd }, { sequence: 0xffffffff }],
      vout: [{ value: 1000 }, { value: 2000 }],
      status: { confirmed: false },
    });
    expect(detail).toMatchObject({ inputs: 2, outputs: 2, value: 3000, vsize: 200, feeRate: 4, rbf: true });
  });

  it("accepts known visual modes and falls back to matrix", () => {
    expect(normalizeMode("constellation")).toBe("constellation");
    expect(normalizeMode("unknown")).toBe("matrix");
  });
});
