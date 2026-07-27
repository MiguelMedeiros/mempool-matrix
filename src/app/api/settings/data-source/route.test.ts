import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSettingsRateLimits, settingsTestRateLimitResponse } from "@/lib/settings-auth";
import { createDataSourceRouteHandlers } from "./route";

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    access: () => "authorized" as const,
    rateLimit: settingsTestRateLimitResponse,
    status: vi.fn(async () => ({ type: "mempool-api", canConfigure: true })),
    validate: vi.fn((body: Record<string, unknown>) => ({ baseUrl: String(body.baseUrl), label: body.label as string | undefined })),
    probe: vi.fn(async () => ({ ok: true })),
    save: vi.fn(async (source: { baseUrl: string }) => ({ ...source, updatedAt: "2026-01-01T00:00:00.000Z" })),
    health: vi.fn(),
    ...overrides,
  };
}

const put = (body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://local/api/settings/data-source", { method: "PUT", headers, body });

afterEach(() => {
  clearSettingsRateLimits();
});

describe("data source settings route", () => {
  it("rejects unauthorized writes before reading the body or consuming rate-limit quota", async () => {
    const rateLimit = vi.fn(() => null);
    const deps = dependencies({ access: () => "unauthorized" as const, rateLimit });
    const response = await createDataSourceRouteHandlers(deps).PUT(put("not-json"));
    expect(response.status).toBe(401);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(deps.validate).not.toHaveBeenCalled();
  });

  it("returns actionable read-only status before rate limiting or reading the body", async () => {
    const rateLimit = vi.fn(() => null);
    const deps = dependencies({ access: () => "read-only" as const, rateLimit });
    const response = await createDataSourceRouteHandlers(deps).PUT(put("not-json"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "settings-read-only",
      message: "Settings are read-only. Configure MEMPOOL_SETTINGS_TOKEN or explicitly enable trusted development access.",
    });
    expect(rateLimit).not.toHaveBeenCalled();
    expect(deps.validate).not.toHaveBeenCalled();
    expect(deps.probe).not.toHaveBeenCalled();
  });

  it("serves redacted public status and editable authenticated status", async () => {
    const status = vi.fn(async (canConfigure: boolean) => ({ canConfigure }));
    const publicDeps = dependencies({ access: () => "unauthorized" as const, status });
    await expect((await createDataSourceRouteHandlers(publicDeps).GET(new Request("http://local"))).json())
      .resolves.toEqual({ canConfigure: false });
    expect(status).toHaveBeenLastCalledWith(false);

    const editableDeps = dependencies({ access: () => "authorized" as const, status });
    await expect((await createDataSourceRouteHandlers(editableDeps).GET(new Request("http://local"))).json())
      .resolves.toEqual({ canConfigure: true });
    expect(status).toHaveBeenLastCalledWith(true);
  });

  it("rate limits repeated writes before running the blocked probe", async () => {
    const deps = dependencies();
    const handlers = createDataSourceRouteHandlers(deps);

    for (let request = 0; request < 6; request += 1) {
      expect((await handlers.PUT(put('{"baseUrl":"http://node/api"}'))).status).toBe(200);
    }
    const response = await handlers.PUT(put('{"baseUrl":"http://node/api"}'));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "rate-limited",
      message: "Too many connection tests. Try again shortly.",
    });
    expect(deps.probe).toHaveBeenCalledTimes(6);
  });

  it("rejects malformed JSON as a client error", async () => {
    const response = await createDataSourceRouteHandlers(dependencies()).PUT(put("{"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid-request" });
  });

  it("requires JSON and enforces the body limit", async () => {
    const handlers = createDataSourceRouteHandlers(dependencies());
    expect((await handlers.PUT(put("plain", { "content-type": "text/plain" }))).status).toBe(400);
    const oversized = JSON.stringify({ baseUrl: `http://node/api/${"x".repeat(4_096)}` });
    expect((await handlers.PUT(put(oversized))).status).toBe(413);
  });

  it.each(["application/jsonp", "application/json-evil"])("rejects the non-JSON media type %s", async (contentType) => {
    const response = await createDataSourceRouteHandlers(dependencies()).PUT(put("{", { "content-type": contentType }));
    await expect(response.json()).resolves.toMatchObject({ message: "Content-Type must be application/json." });
  });

  it.each(["application/json", "application/json; charset=utf-8"])("accepts the JSON media type %s", async (contentType) => {
    const response = await createDataSourceRouteHandlers(dependencies()).PUT(put("{", { "content-type": contentType }));
    await expect(response.json()).resolves.toMatchObject({ message: "Request body must be valid JSON." });
  });

  it("rejects a UTF-8 body over 4096 bytes even when its string length is smaller", async () => {
    const handlers = createDataSourceRouteHandlers(dependencies());
    const multibyte = JSON.stringify({ baseUrl: `http://node/api/${"é".repeat(2_100)}` });
    expect(multibyte.length).toBeLessThan(4_096);
    expect(Buffer.byteLength(multibyte, "utf8")).toBeGreaterThan(4_096);

    expect((await handlers.PUT(put(multibyte))).status).toBe(413);
  });

  it("reports probe failure as 502", async () => {
    const deps = dependencies({ probe: vi.fn(async () => { throw new Error("http://user:secret@node/api"); }) });
    const response = await createDataSourceRouteHandlers(deps).PUT(put('{"baseUrl":"http://node/api"}'));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });

  it("reports local persistence failure as safe administrative 500", async () => {
    const deps = dependencies({ save: vi.fn(async () => { throw new Error("/data/runtime-config.json http://secret"); }) });
    const response = await createDataSourceRouteHandlers(deps).PUT(put('{"baseUrl":"http://node/api"}'));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "settings-persistence-failed",
      message: "Could not persist data-source settings.",
    });
  });
});
