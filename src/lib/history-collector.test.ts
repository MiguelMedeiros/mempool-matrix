import { describe, expect, it, vi } from "vitest";
import { collectHistoryCycle } from "./history-collector";

describe("history collector lock", () => {
  it("releases collecting after failure so a later cycle can recover", async () => {
    const state = { collecting: false };
    await collectHistoryCycle(state, vi.fn(async () => { throw new Error("timeout"); }));
    expect(state.collecting).toBe(false);
    const recovered = vi.fn(async () => undefined);
    await collectHistoryCycle(state, recovered);
    expect(recovered).toHaveBeenCalledOnce();
    expect(state.collecting).toBe(false);
  });
});
