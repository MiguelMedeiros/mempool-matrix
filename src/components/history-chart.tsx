"use client";

import {
  useId,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  buildAreaPath,
  buildLinePath,
  chartXForIndex,
  chartYForValue,
  nearestChartIndex,
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
  timestamps: string[];
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
  timestamps,
  formatValue,
  from,
  to,
}: HistoryChartProps) {
  const id = useId();
  const gradientId = `${id}-gradient`.replace(/:/g, "");
  const instructionsId = `${id}-instructions`;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const primary = series[0]?.values ?? [];
  const summary = summarizeSeries(primary);
  const domain = seriesDomain(series.map((item) => item.values));
  const hasData = primary.length >= 2;
  const trend = summary?.changePercent;
  const selectedIndex = activeIndex === null || !hasData
    ? null
    : Math.min(activeIndex, primary.length - 1);
  const selectedX = selectedIndex === null
    ? null
    : chartXForIndex(selectedIndex, primary.length, WIDTH, PADDING);
  const selectedTimestamp = selectedIndex === null
    ? undefined
    : timestamps[selectedIndex];
  const selectedSeries = selectedIndex === null
    ? []
    : series.filter((item) => Number.isFinite(item.values[selectedIndex]));
  const liveText = selectedIndex === null
    ? ""
    : [
        formatExactTime(selectedTimestamp),
        ...selectedSeries.map((item) => `${item.label}: ${formatValue(item.values[selectedIndex])}`),
      ].join(". ");

  function selectFromClientX(clientX: number, target: HTMLDivElement) {
    const bounds = target.getBoundingClientRect();
    if (bounds.width === 0) return;
    const chartX = ((clientX - bounds.left) / bounds.width) * WIDTH;
    setActiveIndex(nearestChartIndex(chartX, primary.length, WIDTH, PADDING));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    selectFromClientX(event.clientX, event.currentTarget);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (
      event.pointerType === "mouse"
      || event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      selectFromClientX(event.clientX, event.currentTarget);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const latestIndex = primary.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowLeft") {
      nextIndex = Math.max(0, (selectedIndex ?? latestIndex) - 1);
    } else if (event.key === "ArrowRight") {
      nextIndex = Math.min(latestIndex, (selectedIndex ?? -1) + 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = latestIndex;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      setActiveIndex(nextIndex);
    }
  }

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

      <div
        role="group"
        tabIndex={hasData ? 0 : -1}
        aria-label={`${title} historical chart`}
        aria-describedby={instructionsId}
        onFocus={() => setActiveIndex((current) => current ?? primary.length - 1)}
        onBlur={() => setActiveIndex(null)}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={(event) => {
          if (
            event.pointerType === "mouse"
            && event.currentTarget !== document.activeElement
          ) {
            setActiveIndex(null);
          }
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        className="relative mt-4 h-48 cursor-crosshair touch-pan-y select-none rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        <span id={instructionsId} className="sr-only">
          {description} Use Left and Right Arrow keys to inspect samples, or Home and End to jump to the first and latest samples.
        </span>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {liveText}
        </span>
        {hasData ? (
          <>
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
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
              {selectedX !== null && (
                <line
                  x1={selectedX}
                  x2={selectedX}
                  y1={PADDING}
                  y2={HEIGHT - PADDING}
                  stroke="rgba(210,255,225,.55)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            {selectedIndex !== null && selectedX !== null && (
              <>
                {selectedSeries.map((item) => {
                  const y = chartYForValue(
                    item.values[selectedIndex],
                    HEIGHT,
                    PADDING,
                    domain,
                  );
                  return (
                    <span
                      key={item.label}
                      aria-hidden="true"
                      className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/80 shadow-[0_0_8px_rgba(255,255,255,.35)]"
                      style={{
                        backgroundColor: item.color,
                        left: `${(selectedX / WIDTH) * 100}%`,
                        top: `${(y / HEIGHT) * 100}%`,
                      }}
                    />
                  );
                })}
                <div
                  role="tooltip"
                  className="pointer-events-none absolute top-2 z-10 w-max min-w-40 max-w-[calc(100%-1rem)] rounded-lg border border-emerald-300/25 bg-[#021009]/95 px-3 py-2 font-mono text-[9px] text-emerald-50 shadow-[0_14px_36px_rgba(0,0,0,.7)] backdrop-blur-md"
                  style={{
                    left: `${(selectedX / WIDTH) * 100}%`,
                    transform: tooltipTransform(selectedX),
                  }}
                >
                  <div className="whitespace-nowrap border-b border-emerald-300/15 pb-1.5 text-[8px] uppercase tracking-[.08em] text-emerald-100/55">
                    {formatExactTime(selectedTimestamp)}
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {selectedSeries.map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-5">
                        <span className="flex min-w-0 items-center gap-1.5 text-emerald-100/55">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        <span className="shrink-0 text-emerald-50">
                          {formatValue(item.values[selectedIndex])}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
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

function formatExactTime(value?: string): string {
  if (!value) return "Unknown timestamp";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function tooltipTransform(x: number): string {
  if (x <= WIDTH * 0.3) return "translateX(0)";
  if (x >= WIDTH * 0.7) return "translateX(-100%)";
  return "translateX(-50%)";
}
