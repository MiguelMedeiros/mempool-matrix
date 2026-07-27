import { describe, expect, it } from "vitest";
import {
  buildAreaPath,
  buildLinePath,
  chartXForIndex,
  chartYForValue,
  nearestChartIndex,
  seriesDomain,
  summarizeSeries,
} from "./chart";

describe("historical chart helpers", () => {
  it("builds line and area paths within the chart bounds", () => {
    expect(buildLinePath([10, 20, 15], 100, 40, 2)).toBe("M2,38 L50,2 L98,20");
    expect(buildAreaPath([10, 20, 15], 100, 40, 2))
      .toBe("M2,38 L50,2 L98,20 L98,38 L2,38 Z");
  });

  it("shares a domain across multiple fee series", () => {
    expect(seriesDomain([[2, 4], [1, 8]])).toEqual([1, 8]);
    expect(seriesDomain([[5, 5]])).toEqual([4.5, 5.5]);
  });

  it("finds the nearest sample within padded chart bounds", () => {
    expect(nearestChartIndex(2, 5, 100, 10)).toBe(0);
    expect(nearestChartIndex(31, 5, 100, 10)).toBe(1);
    expect(nearestChartIndex(72, 5, 100, 10)).toBe(3);
    expect(nearestChartIndex(110, 5, 100, 10)).toBe(4);
    expect(nearestChartIndex(50, 1, 100, 10)).toBe(0);
  });

  it("maps sample coordinates to the shared chart domain", () => {
    expect(chartXForIndex(2, 5, 100, 10)).toBe(50);
    expect(chartYForValue(15, 40, 2, [10, 20])).toBe(20);
  });

  it("summarizes latest value and relative change", () => {
    expect(summarizeSeries([100, 125, 120])).toEqual({
      first: 100,
      latest: 120,
      minimum: 100,
      maximum: 125,
      change: 20,
      changePercent: 20,
    });
    expect(summarizeSeries([])).toBeNull();
  });
});
