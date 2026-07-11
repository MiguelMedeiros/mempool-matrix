import { describe, expect, it, vi } from "vitest";
import { fetchMempoolSnapshot } from "./mempool";

const recent = [
  {
    txid: "b9c5d0bc91dd727dfecc3e26e11ce4c7726fec7e747adad0281a9bd3f19ab218",
    fee: 1026,
    vsize: 342,
    value: 158394,
  },
];

describe("fetchMempoolSnapshot", () => {
  it("combines node-backed recent transactions and mempool stats", async () => {
    const fetcher = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith("/mempool/recent") ? recent : {
        count: 68917,
        vsize: 40731699,
        total_fee: 9186671,
      }),
    })) as unknown as typeof fetch;

    const snapshot = await fetchMempoolSnapshot(fetcher, "http://mempool-web/api");

    expect(snapshot.transactions).toHaveLength(1);
    expect(snapshot.stats).toEqual({ count: 68917, vsize: 40731699, totalFee: 9186671 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("throws a safe error when the local node API is unavailable", async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(fetchMempoolSnapshot(fetcher, "http://mempool-web/api")).rejects.toThrow(
      "Mempool source unavailable",
    );
  });
});
