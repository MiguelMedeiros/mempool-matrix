import {
  normalizeTransactionDetail,
  type BlockSummary,
  type FeeRecommendations,
  type TransactionDetail,
} from "./experience";
import { normalizeTransaction, type MempoolTransaction } from "./transactions";

export const DEFAULT_MEMPOOL_REQUEST_TIMEOUT_MS = 8_000;

export type MempoolStats = { count: number; vsize: number; totalFee: number };
export type MempoolSnapshot = {
  transactions: MempoolTransaction[];
  stats: MempoolStats;
  fees: FeeRecommendations;
  block: BlockSummary;
  fetchedAt: string;
};

export async function fetchMempoolSnapshot(
  fetcher: typeof fetch,
  baseUrl: string,
  signal?: AbortSignal,
  timeoutMs = getMempoolRequestTimeout(),
): Promise<MempoolSnapshot> {
  return withRequestScope(signal, timeoutMs, async (requestSignal, abortSiblings) => {
    const base = baseUrl.replace(/\/$/, "");
    const requestInit: RequestInit = { cache: "no-store", redirect: "manual", signal: requestSignal };
    try {
      const responses = await Promise.all([
        requiredFetch(fetcher, `${base}/mempool/recent`, requestInit),
        requiredFetch(fetcher, `${base}/mempool`, requestInit),
        requiredFetch(fetcher, `${base}/v1/fees/recommended`, requestInit),
        requiredFetch(fetcher, `${base}/v1/blocks`, requestInit),
      ]);
      const [recent, rawStats, rawFees, rawBlocks] = await Promise.all(responses.map((response) => response.json()));
      if (!Array.isArray(recent) || !isRecord(rawStats) || !isRecord(rawFees)
        || !Array.isArray(rawBlocks) || rawBlocks.length === 0 || !isRecord(rawBlocks[0])
        || !hasFiniteNumber(rawStats, "count") || !hasFiniteNumber(rawStats, "vsize")
        || !hasFiniteNumber(rawStats, "total_fee") || !hasFiniteNumber(rawFees, "fastestFee")
        || !hasFiniteNumber(rawFees, "halfHourFee") || !hasFiniteNumber(rawFees, "hourFee")
        || !hasFiniteNumber(rawFees, "economyFee") || !hasFiniteNumber(rawFees, "minimumFee")
        || !hasFiniteNumber(rawBlocks[0], "height") || !hasFiniteNumber(rawBlocks[0], "tx_count")
        || !hasFiniteNumber(rawBlocks[0], "size") || !hasFiniteNumber(rawBlocks[0], "timestamp")) {
        throw new Error("Mempool source incompatible");
      }
      const latestBlock = rawBlocks[0];
      return {
        transactions: recent.map((item) => normalizeTransaction(item)).filter((item): item is MempoolTransaction => Boolean(item)),
        stats: { count: safeNumber(rawStats.count), vsize: safeNumber(rawStats.vsize), totalFee: safeNumber(rawStats.total_fee) },
        fees: {
          fastestFee: safeNumber(rawFees.fastestFee), halfHourFee: safeNumber(rawFees.halfHourFee),
          hourFee: safeNumber(rawFees.hourFee), economyFee: safeNumber(rawFees.economyFee), minimumFee: safeNumber(rawFees.minimumFee),
        },
        block: {
          id: typeof latestBlock.id === "string" ? latestBlock.id : undefined,
          height: safeNumber(latestBlock.height), txCount: safeNumber(latestBlock.tx_count),
          size: safeNumber(latestBlock.size), timestamp: safeNumber(latestBlock.timestamp),
        },
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      abortSiblings(error);
      throw normalizeRequestError(error, requestSignal, signal);
    }
  });
}

export async function fetchTransactionDetail(
  fetcher: typeof fetch,
  baseUrl: string,
  txid: string,
  signal?: AbortSignal,
  timeoutMs = getMempoolRequestTimeout(),
): Promise<TransactionDetail> {
  if (!/^[0-9a-f]{64}$/i.test(txid)) throw new Error("Invalid transaction id");
  return withRequestScope(signal, timeoutMs, async (requestSignal, abortSiblings) => {
    const transactionUrl = `${baseUrl.replace(/\/$/, "")}/tx/${txid}`;
    const requestInit: RequestInit = { cache: "no-store", redirect: "manual", signal: requestSignal };
    try {
      const [response, outspendsResponse, hexResponse] = await Promise.all([
        fetcher(transactionUrl, requestInit).then((result) => {
          if (!result.ok) throw new Error(result.status === 404 ? "Transaction not found" : "Transaction unavailable");
          return result;
        }),
        optionalFetch(fetcher, `${transactionUrl}/outspends`, requestInit, requestSignal),
        optionalFetch(fetcher, `${transactionUrl}/hex`, requestInit, requestSignal),
      ]);
      const [raw, outspends, rawHex] = await Promise.all([
        response.json(),
        optionalJson(outspendsResponse, []),
        hexResponse?.ok ? hexResponse.text().catch(() => "") : "",
      ]);
      return normalizeTransactionDetail(raw as Record<string, unknown>, outspends, rawHex);
    } catch (error) {
      abortSiblings(error);
      throw normalizeRequestError(error, requestSignal, signal);
    }
  });
}

export function getMempoolRequestTimeout(value = process.env.MEMPOOL_REQUEST_TIMEOUT_MS): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 60_000) : DEFAULT_MEMPOOL_REQUEST_TIMEOUT_MS;
}

async function withRequestScope<T>(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
  operation: (signal: AbortSignal, abort: (reason?: unknown) => void) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort(callerSignal?.reason ?? new Error("Request aborted"));
  if (callerSignal?.aborted) onCallerAbort();
  else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Mempool source timed out")), timeoutMs);
  try {
    return await operation(controller.signal, (reason) => controller.abort(reason));
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

async function requiredFetch(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  const response = await fetcher(url, init);
  if (!response.ok) throw new Error("Mempool source unavailable");
  return response;
}

async function optionalFetch(fetcher: typeof fetch, url: string, init: RequestInit, signal: AbortSignal): Promise<Response | null> {
  try { return await fetcher(url, init); }
  catch (error) { if (signal.aborted) throw error; return null; }
}

async function optionalJson(response: Response | null, fallback: unknown): Promise<unknown> {
  if (!response?.ok) return fallback;
  try { return await response.json(); } catch { return fallback; }
}

function normalizeRequestError(error: unknown, requestSignal: AbortSignal, callerSignal?: AbortSignal): unknown {
  if (callerSignal?.aborted) return callerSignal.reason ?? new Error("Request aborted");
  if (requestSignal.aborted && requestSignal.reason instanceof Error && requestSignal.reason.message.includes("timed out")) return requestSignal.reason;
  return error;
}
function safeNumber(value: unknown): number { const number = Number(value); return Number.isFinite(number) ? Math.max(0, number) : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasFiniteNumber(value: Record<string, unknown>, key: string): boolean { return typeof value[key] === "number" && Number.isFinite(value[key]); }
