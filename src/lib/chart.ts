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

export function buildLinePath(
  values: number[],
  width: number,
  height: number,
  padding = 0,
  domain = seriesDomain([values]),
): string {
  if (values.length === 0) return "";
  const [minimum, maximum] = domain;
  const range = Math.max(Number.EPSILON, maximum - minimum);
  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(0, height - padding * 2);

  return values.map((value, index) => {
    const x = values.length === 1
      ? width / 2
      : padding + (index / (values.length - 1)) * innerWidth;
    const y = padding + (1 - (value - minimum) / range) * innerHeight;
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
