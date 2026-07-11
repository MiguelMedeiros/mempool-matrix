import { describe, expect, it } from "vitest";
import {
  createDrop,
  mergeTransactions,
  normalizeTransaction,
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
