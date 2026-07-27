export type SeriesSummary = {
  first: number;
  latest: number;
  minimum: number;
  maximum: number;
  change: number;
  changePercent: number | null;
};

export function seriesDomain(series: number[][]): [number, number] {
  const values = series.flat().filter(Number.isFinite);
  if (values.length === 0) return [0, 1];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return minimum === maximum ? [minimum - 0.5, maximum + 0.5] : [minimum, maximum];
}

export function chartXForIndex(
  index: number,
  pointCount: number,
  width: number,
  padding = 0,
): number {
  if (pointCount <= 1) return width / 2;
  const innerWidth = Math.max(0, width - padding * 2);
  const boundedIndex = Math.min(pointCount - 1, Math.max(0, index));
  return padding + (boundedIndex / (pointCount - 1)) * innerWidth;
}

export function nearestChartIndex(
  x: number,
  pointCount: number,
  width: number,
  padding = 0,
): number {
  if (pointCount <= 1 || !Number.isFinite(x)) return 0;
  const innerWidth = Math.max(0, width - padding * 2);
  if (innerWidth === 0) return 0;
  const boundedX = Math.min(width - padding, Math.max(padding, x));
  return Math.round(((boundedX - padding) / innerWidth) * (pointCount - 1));
}

export function chartYForValue(
  value: number,
  height: number,
  padding = 0,
  domain: [number, number] = [0, 1],
): number {
  const [minimum, maximum] = domain;
  const range = Math.max(Number.EPSILON, maximum - minimum);
  const innerHeight = Math.max(0, height - padding * 2);
  return padding + (1 - (value - minimum) / range) * innerHeight;
}

export function buildLinePath(
  values: number[],
  width: number,
  height: number,
  padding = 0,
  domain = seriesDomain([values]),
): string {
  if (values.length === 0) return "";

  return values.map((value, index) => {
    const x = chartXForIndex(index, values.length, width, padding);
    const y = chartYForValue(value, height, padding, domain);
    return `${index === 0 ? "M" : "L"}${round(x)},${round(y)}`;
  }).join(" ");
}

export function buildAreaPath(
  values: number[],
  width: number,
  height: number,
  padding = 0,
  domain = seriesDomain([values]),
): string {
  const line = buildLinePath(values, width, height, padding, domain);
  if (!line) return "";
  const firstX = values.length === 1 ? width / 2 : padding;
  const lastX = values.length === 1 ? width / 2 : width - padding;
  const baseline = height - padding;
  return `${line} L${round(lastX)},${round(baseline)} L${round(firstX)},${round(baseline)} Z`;
}

export function summarizeSeries(values: number[]): SeriesSummary | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const first = finite[0];
  const latest = finite.at(-1)!;
  const change = latest - first;
  return {
    first,
    latest,
    minimum: Math.min(...finite),
    maximum: Math.max(...finite),
    change,
    changePercent: first === 0 ? null : (change / first) * 100,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
