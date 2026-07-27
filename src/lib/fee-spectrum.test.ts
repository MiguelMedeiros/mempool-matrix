import { describe, expect, it } from "vitest";
import {
  buildFeeDensityBins,
  createFeeSpectrumAxis,
  feeRatePosition,
} from "./fee-spectrum";

describe("fee spectrum axis", () => {
  it("includes sampled fees and recommendation thresholds in a nice domain", () => {
    const samples = [
      { feeRate: 2, vsize: 100 },
      { feeRate: 87, vsize: 200 },
    ];

    expect(createFeeSpectrumAxis(samples, [1, 8, 12, 110])).toEqual({ maximumRate: 200 });
  });

  it("maps rates logarithmically from zero through the domain maximum", () => {
    const axis = { maximumRate: 100 };

    expect(feeRatePosition(0, axis)).toBe(0);
    expect(feeRatePosition(100, axis)).toBe(1);
    expect(feeRatePosition(10, axis)).toBeCloseTo(Math.log1p(10) / Math.log1p(100));
    expect(feeRatePosition(10, axis)).toBeGreaterThan(0.5);
  });
});

describe("fee spectrum density bins", () => {
  it("bins on the log axis and weights density by sampled virtual size", () => {
    const axis = { maximumRate: 100 };
    const bins = buildFeeDensityBins([
      { feeRate: 0, vsize: 100 },
      { feeRate: 10, vsize: 900 },
      { feeRate: 100, vsize: 250 },
    ], axis, 4);

    expect(bins).toEqual([
      { count: 1, vsize: 100 },
      { count: 0, vsize: 0 },
      { count: 1, vsize: 900 },
      { count: 1, vsize: 250 },
    ]);
    expect(bins.reduce((total, bin) => total + bin.vsize, 0)).toBe(1_250);
  });

  it("keeps malformed values in a safe first bin", () => {
    const bins = buildFeeDensityBins([
      { feeRate: Number.NaN, vsize: Number.NaN },
    ], { maximumRate: Number.NaN }, 0);

    expect(bins).toEqual([{ count: 1, vsize: 0 }]);
  });
});
