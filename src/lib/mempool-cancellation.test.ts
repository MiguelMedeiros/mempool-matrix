import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMempoolSnapshot, fetchTransactionDetail } from "./mempool";

afterEach(() => vi.useRealTimers());

describe("mempool request cancellation", () => {
  it("times out and aborts every sibling request", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }) as unknown as typeof fetch;
    const pending = fetchMempoolSnapshot(fetcher, "http://node/api", undefined, 20);
    const expectation = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(20);
    await expectation;
    expect(signals).toHaveLength(4);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("honors caller abort and aborts siblings", async () => {
    const caller = new AbortController();
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }) as unknown as typeof fetch;
    const pending = fetchMempoolSnapshot(fetcher, "http://node/api", caller.signal, 1_000);
    caller.abort(new Error("caller stopped"));
    await expect(pending).rejects.toThrow("caller stopped");
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("aborts pending siblings as soon as one endpoint fails", async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      if (url.endsWith("/mempool/recent")) {
        return Promise.resolve(new Response("bad", { status: 503 }));
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }) as unknown as typeof fetch;
    await expect(fetchMempoolSnapshot(fetcher, "http://node/api", undefined, 1_000))
      .rejects.toThrow("unavailable");
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("ignores malformed optional transaction JSON", async () => {
    const txid = "d".repeat(64);
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/outspends")) return new Response("not-json");
      if (url.endsWith("/hex")) return new Response("0100");
      return new Response(JSON.stringify({
        txid, version: 2, locktime: 0, size: 100, weight: 400,
        fee: 1, vin: [], vout: [], status: { confirmed: false },
      }));
    }) as unknown as typeof fetch;
    await expect(fetchTransactionDetail(fetcher, "http://node/api", txid))
      .resolves.toMatchObject({ txid, rawHex: "0100" });
  });
});
