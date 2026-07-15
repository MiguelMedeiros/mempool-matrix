import { describe, expect, it } from "vitest";
import {
  buildAreaPath,
  buildLinePath,
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
