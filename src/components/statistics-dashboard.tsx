"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HistoryChart, type HistoryChartSeries } from "@/components/history-chart";
import { useMempoolHistory } from "@/hooks/use-mempool-history";
import {
  HISTORY_RANGES,
  transactionRates,
  type HistoryRange,
  type MempoolHistoryPoint,
} from "@/lib/history";

const RANGE_LABELS: Record<HistoryRange, string> = {
  "1h": "1 hour",
  "6h": "6 hours",
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
};

export function StatisticsDashboard() {
  const [range, setRange] = useState<HistoryRange>("24h");
  const { points, sampleIntervalMs, loading, error, refresh } = useMempoolHistory(range, 480);
  const latest = points.at(-1);
  const from = points[0]?.fetchedAt;
  const to = latest?.fetchedAt;
  const series = useMemo(() => buildSeries(points), [points]);
  const timestamps = useMemo(
    () => points.map((point) => point.fetchedAt),
    [points],
  );

  return (
    <main className="relative h-dvh w-full overflow-y-auto bg-[#010302] text-emerald-50">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(24,110,61,.2),transparent_42%),linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.65))]" />
      <div className="pointer-events-none fixed inset-0 opacity-20 [background-image:linear-gradient(rgba(80,255,145,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(80,255,145,.035)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7 sm:pt-7">
        <header className="flex flex-col gap-5 border-b border-emerald-300/15 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.24em] text-emerald-300/60">
              <span className={`size-2 rounded-full ${error ? "bg-amber-400" : "animate-pulse bg-emerald-300"}`} />
              {error ? "history offline" : loading ? "loading archive" : "historical telemetry"}
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.055em] text-white sm:text-5xl">
              mempool<span className="text-emerald-400">.statistics</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-emerald-50/45">
              Persistent telemetry collected directly from the Bitcoin node on zero.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refresh()}
              className="min-h-11 rounded-full border border-emerald-300/15 bg-black/35 px-4 font-mono text-[9px] uppercase tracking-[.16em] text-emerald-100/60 transition hover:border-emerald-300/40"
            >
              refresh
            </button>
            <Link
              href="/"
              className="flex min-h-11 items-center rounded-full border border-emerald-200/35 bg-emerald-300/10 px-4 font-mono text-[9px] uppercase tracking-[.16em] text-emerald-50 transition hover:bg-emerald-300/15"
            >
              ← matrix
            </Link>
          </div>
        </header>

        <section aria-label="Current mempool metrics" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryMetric label="transactions" value={latest ? formatCompact(latest.transactions) : "—"} />
          <SummaryMetric label="virtual size" value={latest ? formatMegabytes(latest.vsize) : "—"} />
          <SummaryMetric label="next block" value={latest ? `${latest.fastestFee} sat/vB` : "—"} />
          <SummaryMetric label="block height" value={latest ? formatInteger(latest.blockHeight) : "—"} />
        </section>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full overflow-x-auto rounded-xl border border-emerald-300/10 bg-black/35 p-1 sm:w-auto">
            {HISTORY_RANGES.map((item) => (
              <button
                key={item}
                onClick={() => setRange(item)}
                className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 font-mono text-[9px] uppercase tracking-[.12em] transition sm:flex-none ${range === item ? "bg-emerald-300/15 text-emerald-50" : "text-emerald-100/35 hover:text-emerald-100/60"}`}
              >
                {RANGE_LABELS[item]}
              </button>
            ))}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[.14em] text-emerald-100/30">
            {points.length > 0
              ? `${points.length} points · ${Math.round(sampleIntervalMs / 1000)}s sampling · updated ${formatTimestamp(to)}`
              : "waiting for the first collector sample"}
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 font-mono text-[10px] text-amber-100/70">
            {error}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <HistoryChart
            title="transactions"
            description="Transactions currently waiting in the mempool."
            series={[series.transactions]}
            timestamps={timestamps}
            formatValue={formatCompact}
            from={from}
            to={to}
          />
          <HistoryChart
            title="virtual size"
            description="Aggregate virtual size of unconfirmed transactions."
            series={[series.vsize]}
            timestamps={timestamps}
            formatValue={formatMegabytes}
            from={from}
            to={to}
          />
          <HistoryChart
            title="transaction arrival"
            description="Net transaction growth between collector samples."
            series={[series.arrival]}
            timestamps={timestamps}
            formatValue={(value) => `${value.toFixed(1)} tx/s`}
            from={from}
            to={to}
          />
          <HistoryChart
            title="mempool fees"
            description="Total fees currently attached to unconfirmed transactions."
            series={[series.totalFee]}
            timestamps={timestamps}
            formatValue={formatBtc}
            from={from}
            to={to}
          />
          <HistoryChart
            title="fee estimates"
            description="Recommended confirmation targets from the local mempool node."
            series={series.fees}
            timestamps={timestamps}
            formatValue={(value) => `${Math.round(value)} sat/vB`}
            from={from}
            to={to}
          />
          <HistoryChart
            title="latest block size"
            description="Size of the most recently indexed Bitcoin block."
            series={[series.blockSize]}
            timestamps={timestamps}
            formatValue={formatMegabytes}
            from={from}
            to={to}
          />
        </div>
      </div>
    </main>
  );
}

function buildSeries(points: MempoolHistoryPoint[]): {
  transactions: HistoryChartSeries;
  vsize: HistoryChartSeries;
  arrival: HistoryChartSeries;
  totalFee: HistoryChartSeries;
  fees: HistoryChartSeries[];
  blockSize: HistoryChartSeries;
} {
  return {
    transactions: {
      label: "transactions",
      values: points.map((point) => point.transactions),
      color: "#7dffad",
    },
    vsize: {
      label: "virtual size",
      values: points.map((point) => point.vsize),
      color: "#5dff9b",
    },
    arrival: {
      label: "tx/s",
      values: transactionRates(points),
      color: "#b0ffd0",
    },
    totalFee: {
      label: "total fee",
      values: points.map((point) => point.totalFee),
      color: "#ffe871",
    },
    fees: [
      { label: "fastest", values: points.map((point) => point.fastestFee), color: "#ffe871" },
      { label: "30 min", values: points.map((point) => point.halfHourFee), color: "#aaffc7" },
      { label: "1 hour", values: points.map((point) => point.hourFee), color: "#52dc8a" },
      { label: "economy", values: points.map((point) => point.economyFee), color: "#258552" },
    ],
    blockSize: {
      label: "block size",
      values: points.map((point) => point.blockSize),
      color: "#8fb9ff",
    },
  };
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-300/12 bg-black/45 p-4">
      <div className="font-mono text-[9px] uppercase tracking-[.14em] text-emerald-300/50">{label}</div>
      <div className="mt-2 truncate font-mono text-lg font-semibold text-emerald-50 sm:text-xl">{value}</div>
    </div>
  );
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function formatMegabytes(value: number): string {
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

function formatBtc(value: number): string {
  return `${(value / 100_000_000).toFixed(4)} BTC`;
}

function formatTimestamp(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
