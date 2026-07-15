"use client";

import { useId } from "react";
import {
  buildAreaPath,
  buildLinePath,
  seriesDomain,
  summarizeSeries,
} from "@/lib/chart";

export type HistoryChartSeries = {
  label: string;
  values: number[];
  color: string;
};

type HistoryChartProps = {
  title: string;
  description: string;
  series: HistoryChartSeries[];
  formatValue: (value: number) => string;
  from?: string;
  to?: string;
};

const WIDTH = 640;
const HEIGHT = 190;
const PADDING = 16;

export function HistoryChart({
  title,
  description,
  series,
  formatValue,
  from,
  to,
}: HistoryChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const primary = series[0]?.values ?? [];
  const summary = summarizeSeries(primary);
  const domain = seriesDomain(series.map((item) => item.values));
  const hasData = primary.length >= 2;
  const trend = summary?.changePercent;

  return (
    <section className="rounded-2xl border border-emerald-300/15 bg-black/55 p-4 shadow-[0_0_60px_rgba(25,255,110,.035)] sm:p-5">
      <div className="flex min-h-14 items-start justify-between gap-4">
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-[.18em] text-emerald-300/60">{title}</h2>
          <p className="mt-1 text-xs text-emerald-50/40">{description}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-lg font-semibold text-emerald-50">
            {summary ? formatValue(summary.latest) : "—"}
          </div>
          {trend !== null && trend !== undefined && (
            <div className={`mt-1 font-mono text-[9px] ${trend > 0 ? "text-emerald-300/70" : trend < 0 ? "text-amber-200/65" : "text-white/35"}`}>
              {trend > 0 ? "▲" : trend < 0 ? "▼" : "•"} {Math.abs(trend).toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 h-48">
        {hasData ? (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${title}: ${description}`}
            className="h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={series[0].color} stopOpacity=".2" />
                <stop offset="1" stopColor={series[0].color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((position) => (
              <line
                key={position}
                x1={PADDING}
                x2={WIDTH - PADDING}
                y1={HEIGHT * position}
                y2={HEIGHT * position}
                stroke="rgba(110,255,165,.08)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              d={buildAreaPath(primary, WIDTH, HEIGHT, PADDING, domain)}
              fill={`url(#${gradientId})`}
            />
            {series.map((item) => (
              <path
                key={item.label}
                d={buildLinePath(item.values, WIDTH, HEIGHT, PADDING, domain)}
                fill="none"
                stroke={item.color}
                strokeWidth={item === series[0] ? "1.8" : "1.2"}
                strokeOpacity={item === series[0] ? "1" : ".72"}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-emerald-300/10 font-mono text-[10px] uppercase tracking-[.16em] text-emerald-100/30">
            collecting history
          </div>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-4 font-mono text-[9px] text-emerald-100/30">
        <span>{formatTime(from)}</span>
        {series.length > 1 && (
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
            {series.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        )}
        <span>{formatTime(to)}</span>
      </div>
    </section>
  );
}

function formatTime(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
