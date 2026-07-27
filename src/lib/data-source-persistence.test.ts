import { describe, expect, it, vi } from "vitest";
import {
  commitDataSourceToStorage,
  DATA_SOURCE_FORM_STORAGE_KEY,
  parseDataSourceFormValues,
  serializeDataSourceFormValues,
} from "./data-source-persistence";

describe("data-source form persistence", () => {
  it("round-trips non-secret form values", () => {
    const values = {
      baseUrl: "http://mempool-node:8080/api",
      label: "home node",
    };
    expect(parseDataSourceFormValues(serializeDataSourceFormValues(values))).toEqual(values);
  });

  it("never serializes an administrative token", () => {
    const serialized = serializeDataSourceFormValues({
      baseUrl: "http://mempool-node:8080/api",
      label: "home node",
      token: "administrative-secret",
    } as Parameters<typeof serializeDataSourceFormValues>[0] & { token: string });

    expect(serialized).not.toContain("administrative-secret");
    expect(JSON.parse(serialized)).toEqual({
      baseUrl: "http://mempool-node:8080/api",
      label: "home node",
    });
  });

  it("ignores corrupt or incomplete stored values", () => {
    expect(parseDataSourceFormValues("not-json")).toBeNull();
    expect(parseDataSourceFormValues(JSON.stringify({ baseUrl: "http://node/api" }))).toBeNull();
  });

  it("rejects legacy stored URLs containing credentials", () => {
    expect(parseDataSourceFormValues(JSON.stringify({
      baseUrl: "http://user:secret@node/api",
      label: "node",
    }))).toBeNull();
  });

  it("writes only committed credential-free values to storage", () => {
    const storage = { setItem: vi.fn(), removeItem: vi.fn() };
    expect(commitDataSourceToStorage(storage, {
      baseUrl: "http://user:secret@node/api",
      label: "node",
    })).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).toHaveBeenCalledWith(DATA_SOURCE_FORM_STORAGE_KEY);
  });
});
