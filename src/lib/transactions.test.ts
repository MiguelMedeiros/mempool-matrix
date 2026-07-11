import { describe, expect, it } from "vitest";
import {
  createDrop,
  mergeTransactions,
  nextDropLifecycle,
  normalizeTransaction,
  reflowDrops,
  shortTxid,
} from "./transactions";

const tx = {
  txid: "b9c5d0bc91dd727dfecc3e26e11ce4c7726fec7e747adad0281a9bd3f19ab218",
  fee: 1026,
  vsize: 342,
  value: 158394,
};

describe("normalizeTransaction", () => {
  it("derives a bounded fee rate from mempool data", () => {
    expect(normalizeTransaction(tx)).toMatchObject({
      txid: tx.txid,
      fee: 1026,
      vsize: 342,
      value: 158394,
      feeRate: 3,
    });
  });

  it("rejects malformed transaction ids", () => {
    expect(normalizeTransaction({ ...tx, txid: "not-a-txid" })).toBeNull();
  });
});

describe("mergeTransactions", () => {
  it("deduplicates polling results and keeps the newest first", () => {
    const older = normalizeTransaction(tx)!;
    const newer = normalizeTransaction({ ...tx, txid: "a".repeat(64) })!;
    expect(mergeTransactions([older], [older, newer], 10).map((item) => item.txid)).toEqual([
      newer.txid,
      older.txid,
    ]);
  });

  it("caps retained transaction history", () => {
    const incoming = Array.from({ length: 12 }, (_, index) =>
      normalizeTransaction({ ...tx, txid: index.toString(16).padStart(64, "0") })!,
    );
    expect(mergeTransactions([], incoming, 5)).toHaveLength(5);
  });
});

describe("matrix presentation", () => {
  it("slows near the floor, impacts, dissolves, then resets above the viewport", () => {
    const falling = nextDropLifecycle({ phase: "falling", phaseAge: 0, y: 690, speed: 120, cycle: 0 }, 0.1, 700, -200);
    expect(falling.phase).toBe("impact");
    expect(falling.y).toBe(700);

    const impact = nextDropLifecycle({ ...falling, phaseAge: 0.31 }, 0.02, 700, -200);
    expect(impact.phase).toBe("dissolve");
    expect(impact.phaseAge).toBe(0);

    const dissolved = nextDropLifecycle({ ...impact, phaseAge: 0.71 }, 0.02, 700, -200);
    expect(dissolved).toMatchObject({ phase: "falling", phaseAge: 0, y: -200, cycle: 1 });
  });

  it("decelerates a falling txid as it approaches the impact surface", () => {
    const far = nextDropLifecycle({ phase: "falling", phaseAge: 0, y: 100, speed: 100, cycle: 0 }, 0.1, 700, -200);
    const near = nextDropLifecycle({ phase: "falling", phaseAge: 0, y: 600, speed: 100, cycle: 0 }, 0.1, 700, -200);
    expect(far.y - 100).toBeGreaterThan(near.y - 600);
  });

  it("preserves rain lifecycle when a mobile viewport resizes", () => {
    const drop = {
      ...createDrop(normalizeTransaction(tx)!, 390, 844),
      x: 195,
      y: 422,
      phase: "dissolve" as const,
      phaseAge: 0.3,
      cycle: 4,
    };
    const [resized] = reflowDrops([drop], { width: 390, height: 844 }, { width: 844, height: 390 });
    expect(resized).toMatchObject({
      txid: drop.txid,
      phase: "dissolve",
      phaseAge: 0.3,
      cycle: 4,
      x: 422,
      y: 195,
    });
  });

  it("uses deterministic lanes and visual properties for a transaction", () => {
    const normalized = normalizeTransaction(tx)!;
    expect(createDrop(normalized, 390, 844)).toEqual(createDrop(normalized, 390, 844));
    expect(createDrop(normalized, 390, 844)).toMatchObject({ txid: tx.txid });
    expect(createDrop(normalized, 390, 844).x).toBeGreaterThanOrEqual(0);
    expect(createDrop(normalized, 390, 844).x).toBeLessThanOrEqual(390);
  });

  it("shortens txids without losing both identity edges", () => {
    expect(shortTxid(tx.txid, 16)).toBe("b9c5d0bc…f19ab218");
  });
});
