export type FeeSpectrumSample = {
  feeRate: number;
  vsize: number;
};

export type FeeSpectrumAxis = {
  maximumRate: number;
};

export type FeeDensityBin = {
  count: number;
  vsize: number;
};

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function niceMaximum(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

export function createFeeSpectrumAxis(
  samples: FeeSpectrumSample[],
  thresholdRates: number[],
): FeeSpectrumAxis {
  const highestSample = samples.reduce(
    (highest, sample) => Math.max(highest, finiteNonNegative(sample.feeRate)),
    0,
  );
  const highestThreshold = thresholdRates.reduce(
    (highest, rate) => Math.max(highest, finiteNonNegative(rate)),
    0,
  );
  return { maximumRate: niceMaximum(Math.max(1, highestSample, highestThreshold)) };
}

export function feeRatePosition(rate: number, axis: FeeSpectrumAxis): number {
  const maximumRate = Math.max(1, finiteNonNegative(axis.maximumRate));
  const clampedRate = Math.min(maximumRate, finiteNonNegative(rate));
  return Math.log1p(clampedRate) / Math.log1p(maximumRate);
}

export function buildFeeDensityBins(
  samples: FeeSpectrumSample[],
  axis: FeeSpectrumAxis,
  binCount: number,
): FeeDensityBin[] {
  const safeBinCount = Math.max(1, Math.floor(finiteNonNegative(binCount)));
  const bins = Array.from({ length: safeBinCount }, () => ({ count: 0, vsize: 0 }));

  for (const sample of samples) {
    const position = feeRatePosition(sample.feeRate, axis);
    const index = Math.min(safeBinCount - 1, Math.floor(position * safeBinCount));
    bins[index].count += 1;
    bins[index].vsize += finiteNonNegative(sample.vsize);
  }

  return bins;
}
