import { describe, expect, it, vi } from "vitest";
import { probeMempoolSource } from "./mempool-probe";

const payloads: Record<string, unknown> = {
  "/api/mempool/recent": [],
  "/api/mempool": { count: 42, vsize: 10_000, total_fee: 500 },
  "/api/v1/fees/recommended": {
    fastestFee: 8,
    halfHourFee: 6,
    hourFee: 4,
    economyFee: 2,
    minimumFee: 1,
  },
  "/api/v1/blocks": [{
    id: "0".repeat(64),
    height: 958_100,
    tx_count: 3_000,
    size: 1_500_000,
    timestamp: 1_783_000_000,
  }],
};

describe("probeMempoolSource", () => {
  it("checks the required API surface with redirects disabled", async () => {
    const fetchMock = vi.fn<(
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<{ ok: boolean; json: () => Promise<unknown>; redirected: boolean; status: number }>>(async (input) => ({
      ok: true,
      json: async () => payloads[new URL(String(input)).pathname],
      redirected: false,
      status: 200,
    }));
    const fetcher = fetchMock as unknown as typeof fetch;

    await expect(probeMempoolSource(fetcher, {
      baseUrl: "http://node.internal/api",
    })).resolves.toMatchObject({
      ok: true,
      checks: {
        mempoolRecent: true,
        mempoolStats: true,
        feesRecommended: true,
        blocks: true,
      },
      summary: {
        transactionCount: 42,
        blockHeight: 958_100,
        fastestFee: 8,
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.every((call) => call[1]?.redirect === "manual")).toBe(true);
  });

  it("rejects redirects instead of following them", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 302,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(probeMempoolSource(fetcher, {
      baseUrl: "http://node.internal/api",
    })).rejects.toThrow("Mempool source unavailable");
  });

  it("aborts a slow compatibility probe", async () => {
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => (
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })
    )) as unknown as typeof fetch;

    await expect(probeMempoolSource(fetcher, {
      baseUrl: "http://slow.internal/api",
    }, 5)).rejects.toThrow("Mempool source timed out");
  });
});
