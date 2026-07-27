import { snapshotToHistoryPoint } from "./history";
import {
  appendHistoryPoint,
  getHistoryRetentionDays,
  getHistorySampleInterval,
  pruneHistory,
} from "./history-store";
import { fetchMempoolSnapshot } from "./mempool";
import { safeSourceFetch } from "./source-fetch";
import {
  getActiveMempoolSource,
  recordMempoolSourceHealth,
} from "./runtime-config";

type CollectorState = {
  collecting: boolean;
  timer: ReturnType<typeof setInterval>;
};

const collectorGlobal = globalThis as typeof globalThis & {
  __mempoolMatrixHistoryCollector?: CollectorState;
};

export function startHistoryCollector(): void {
  if (process.env.MEMPOOL_HISTORY_ENABLED === "false") return;
  if (collectorGlobal.__mempoolMatrixHistoryCollector) return;

  const interval = getHistorySampleInterval();
  const state: CollectorState = {
    collecting: false,
    timer: setInterval(() => void collectHistory(state), interval),
  };
  state.timer.unref();
  collectorGlobal.__mempoolMatrixHistoryCollector = state;
  void collectHistory(state);
}

async function collectHistory(state: CollectorState): Promise<void> {
  let source: Awaited<ReturnType<typeof getActiveMempoolSource>> | undefined;
  await collectHistoryCycle(state, async () => {
    source = await getActiveMempoolSource();
    const snapshot = await fetchMempoolSnapshot(safeSourceFetch, source.baseUrl);
    recordMempoolSourceHealth(source.baseUrl, true);
    await appendHistoryPoint(snapshotToHistoryPoint(snapshot));
    await pruneHistory(getHistoryRetentionDays());
  }, (error) => {
    if (source) recordMempoolSourceHealth(source.baseUrl, false, "unavailable");
    console.error(
      "[mempool-history] collection failed:",
      error instanceof Error ? error.message : error,
    );
  });
}

export async function collectHistoryCycle(
  state: { collecting: boolean },
  operation: () => Promise<void>,
  onError: (error: unknown) => void = () => undefined,
): Promise<void> {
  if (state.collecting) return;
  state.collecting = true;
  try {
    await operation();
  } catch (error) {
    onError(error);
  } finally {
    state.collecting = false;
  }
}
