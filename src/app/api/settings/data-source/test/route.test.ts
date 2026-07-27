import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSettingsRateLimits } from "@/lib/settings-auth";
import { createDataSourceTestHandler, POST } from "./route";

const originalToken = process.env.MEMPOOL_SETTINGS_TOKEN;
const originalAllowUnauthenticated = process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS;

afterEach(() => {
  clearSettingsRateLimits();
  if (originalToken === undefined) delete process.env.MEMPOOL_SETTINGS_TOKEN;
  else process.env.MEMPOOL_SETTINGS_TOKEN = originalToken;
  if (originalAllowUnauthenticated === undefined) delete process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS;
  else process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS = originalAllowUnauthenticated;
});

describe("data source connection test route", () => {
  it("blocks read-only mode before rate limiting, body reading, or probing", async () => {
    const rateLimit = vi.fn(() => null);
    const readBody = vi.fn(async () => ({ baseUrl: "http://node/api" }));
    const probe = vi.fn(async () => ({ ok: true }));
    const handler = createDataSourceTestHandler({
      access: () => "read-only",
      rateLimit,
      readBody,
      validate: vi.fn(),
      probe,
      health: vi.fn(),
    });
    const response = await handler(new Request("http://local/test", { method: "POST", body: "not-json" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "settings-read-only" });
    expect(rateLimit).not.toHaveBeenCalled();
    expect(readBody).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
  });

  it.each(["application/jsonp", "application/json-evil"])("rejects the non-JSON media type %s after explicit opt-in", async (contentType) => {
    delete process.env.MEMPOOL_SETTINGS_TOKEN;
    process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS = "true";
    const response = await POST(new Request("http://local/api/settings/data-source/test", {
      method: "POST", headers: { "content-type": contentType }, body: "{",
    }));
    await expect(response.json()).resolves.toMatchObject({ message: "Content-Type must be application/json." });
  });

  it.each(["application/json", "application/json; charset=utf-8"])("accepts the JSON media type %s after explicit opt-in", async (contentType) => {
    delete process.env.MEMPOOL_SETTINGS_TOKEN;
    process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS = "true";
    const response = await POST(new Request("http://local/api/settings/data-source/test", {
      method: "POST", headers: { "content-type": contentType }, body: "{",
    }));
    await expect(response.json()).resolves.toMatchObject({ message: "Request body must be valid JSON." });
  });

  it("rejects a UTF-8 body over 4096 bytes after explicit opt-in", async () => {
    delete process.env.MEMPOOL_SETTINGS_TOKEN;
    process.env.MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS = "true";
    const body = JSON.stringify({ baseUrl: `http://node/api/${"é".repeat(2_100)}` });
    expect(body.length).toBeLessThan(4_096);
    expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(4_096);
    const response = await POST(new Request("http://local/api/settings/data-source/test", {
      method: "POST", headers: { "content-type": "application/json" }, body,
    }));
    expect(response.status).toBe(413);
  });
});
