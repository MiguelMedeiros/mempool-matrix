import type { DataSourceProbeResult } from "./data-source-types";
import { fetchMempoolSnapshot } from "./mempool";
import { validateMempoolSource } from "./source-validator";

export const MEMPOOL_PROBE_TIMEOUT_MS = 8_000;

export async function probeMempoolSource(
  fetcher: typeof fetch,
  input: { baseUrl: unknown; label?: unknown },
  timeoutMs = MEMPOOL_PROBE_TIMEOUT_MS,
): Promise<DataSourceProbeResult> {
  const source = validateMempoolSource(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const snapshot = await fetchMempoolSnapshot(fetcher, source.baseUrl, controller.signal);
    return {
      ok: true,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      checks: {
        mempoolRecent: true,
        mempoolStats: true,
        feesRecommended: true,
        blocks: true,
      },
      summary: {
        transactionCount: snapshot.stats.count,
        blockHeight: snapshot.block.height,
        fastestFee: snapshot.fees.fastestFee,
      },
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Mempool source timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
