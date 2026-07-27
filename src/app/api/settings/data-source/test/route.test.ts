import { afterEach, describe, expect, it } from "vitest";
import { clearSettingsRateLimits } from "@/lib/settings-auth";
import { POST } from "./route";

const originalToken = process.env.MEMPOOL_SETTINGS_TOKEN;

afterEach(() => {
  clearSettingsRateLimits();
  if (originalToken === undefined) delete process.env.MEMPOOL_SETTINGS_TOKEN;
  else process.env.MEMPOOL_SETTINGS_TOKEN = originalToken;
});

describe("data source connection test route", () => {
  it.each(["application/jsonp", "application/json-evil"])("rejects the non-JSON media type %s", async (contentType) => {
    delete process.env.MEMPOOL_SETTINGS_TOKEN;
    const response = await POST(new Request("http://local/api/settings/data-source/test", {
      method: "POST",
      headers: { "content-type": contentType },
      body: "{",
    }));

    await expect(response.json()).resolves.toMatchObject({ message: "Content-Type must be application/json." });
  });

  it.each(["application/json", "application/json; charset=utf-8"])("accepts the JSON media type %s", async (contentType) => {
    delete process.env.MEMPOOL_SETTINGS_TOKEN;
    const response = await POST(new Request("http://local/api/settings/data-source/test", {
      method: "POST",
      headers: { "content-type": contentType },
      body: "{",
    }));

    await expect(response.json()).resolves.toMatchObject({ message: "Request body must be valid JSON." });
  });

  it("rejects a UTF-8 body over 4096 bytes even when its string length is smaller", async () => {
    delete process.env.MEMPOOL_SETTINGS_TOKEN;
    const body = JSON.stringify({ baseUrl: `http://node/api/${"é".repeat(2_100)}` });
    expect(body.length).toBeLessThan(4_096);
    expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(4_096);

    const response = await POST(new Request("http://local/api/settings/data-source/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }));

    expect(response.status).toBe(413);
  });
});