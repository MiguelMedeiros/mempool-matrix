import { snapshotToHistoryPoint } from "./history";
import {
  appendHistoryPoint,
  getHistoryRetentionDays,
  getHistorySampleInterval,
  pruneHistory,
} from "./history-store";
import { fetchMempoolSnapshot } from "./mempool";

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
  if (state.collecting) return;
  state.collecting = true;

  try {
    const source = process.env.MEMPOOL_API_URL ?? "http://127.0.0.1:3000/api";
    const snapshot = await fetchMempoolSnapshot(fetch, source);
    await appendHistoryPoint(snapshotToHistoryPoint(snapshot));
    await pruneHistory(getHistoryRetentionDays());
  } catch (error) {
    console.error(
      "[mempool-history] collection failed:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    state.collecting = false;
  }
}
