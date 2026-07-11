import { describe, expect, it, vi } from "vitest";
import { fetchMempoolSnapshot, fetchTransactionDetail } from "./mempool";

const recent = [
  {
    txid: "b9c5d0bc91dd727dfecc3e26e11ce4c7726fec7e747adad0281a9bd3f19ab218",
    fee: 1026,
    vsize: 342,
    value: 158394,
    time: 1783784664,
  },
];

const payloads: Record<string, unknown> = {
  "/mempool/recent": recent,
  "/mempool": { count: 68917, vsize: 40731699, total_fee: 9186671 },
  "/v1/fees/recommended": { fastestFee: 4, halfHourFee: 3, hourFee: 2, economyFee: 2, minimumFee: 1 },
  "/v1/blocks": [{
    id: "0".repeat(64),
    height: 957581,
    tx_count: 4690,
    size: 1556630,
    timestamp: 1783782652,
  }],
};

describe("fetchMempoolSnapshot", () => {
  it("combines transactions, stats, fees and latest block from our node", async () => {
    const fetcher = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => payloads[new URL(url).pathname.replace("/api", "")],
    })) as unknown as typeof fetch;

    const snapshot = await fetchMempoolSnapshot(fetcher, "http://mempool-web/api");

    expect(snapshot.transactions).toHaveLength(1);
    expect(snapshot.stats).toEqual({ count: 68917, vsize: 40731699, totalFee: 9186671 });
    expect(snapshot.fees).toMatchObject({ fastestFee: 4, hourFee: 2 });
    expect(snapshot.block).toMatchObject({ height: 957581, txCount: 4690, size: 1556630 });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("throws a safe error when the local node API is unavailable", async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(fetchMempoolSnapshot(fetcher, "http://mempool-web/api")).rejects.toThrow(
      "Mempool source unavailable",
    );
  });
});

describe("fetchTransactionDetail", () => {
  it("loads and normalizes a transaction from the local explorer", async () => {
    const txid = "a".repeat(64);
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        txid,
        fee: 400,
        weight: 400,
        vin: [{ sequence: 0xfffffffd }],
        vout: [{ value: 50_000 }],
        status: { confirmed: false },
      }),
    })) as unknown as typeof fetch;

    await expect(fetchTransactionDetail(fetcher, "http://mempool-web/api", txid)).resolves.toMatchObject({
      txid,
      feeRate: 4,
      rbf: true,
      inputs: 1,
      outputs: 1,
    });
  });

  it("rejects invalid txids before calling the node", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(fetchTransactionDetail(fetcher, "http://mempool-web/api", "bad")).rejects.toThrow("Invalid transaction id");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
