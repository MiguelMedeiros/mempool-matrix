import { describe, expect, it, vi } from "vitest";
import { assertSafeResolvedAddresses } from "./source-validator";
import { buildPinnedRequestOptions, createSafeSourceFetch, readResponseBodyWithLimit } from "./source-fetch";

describe("resolved source address policy", () => {
  it.each([
    "169.254.20.1",
    "169.254.169.254",
    "fe80::1",
    "fd00:ec2::254",
    "fd00:ec2:0:0:0:0:0:254",
    "::ffff:169.254.169.254",
  ])("blocks metadata or link-local address %s returned by DNS", (address) => {
    expect(() => assertSafeResolvedAddresses([{
      address,
      family: address.includes(":") ? 6 : 4,
    }])).toThrowError(expect.objectContaining({ code: "metadata-endpoint" }));
  });

  it.each(["10.0.0.2", "172.20.0.3", "192.168.1.4", "100.64.0.10", "fd12::10"])(
    "allows deliberate local node address %s",
    (address) => expect(() => assertSafeResolvedAddresses([{
      address,
      family: address.includes(":") ? 6 : 4,
    }])).not.toThrow(),
  );
});

describe("safe source fetch", () => {
  it("rejects a hostname resolving to metadata before opening a connection", async () => {
    const lookup = vi.fn(async () => [{ address: "169.254.169.254", family: 4 as const }]);
    const request = vi.fn();
    const fetcher = createSafeSourceFetch({ lookup, request });

    await expect(fetcher("http://rebind.example/api/mempool"))
      .rejects.toThrow("Cloud metadata endpoints are not allowed");
    expect(request).not.toHaveBeenCalled();
  });

  it("pins the validated address and forces manual redirects", async () => {
    const lookup = vi.fn(async () => [{ address: "10.0.0.8", family: 4 as const }]);
    const request = vi.fn(async (url: URL, init: RequestInit, address: { address: string }) => {
      expect(url.hostname).toBe("node.internal");
      expect(address.address).toBe("10.0.0.8");
      expect(init.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
    });
    const fetcher = createSafeSourceFetch({ lookup, request });

    const response = await fetcher("https://node.internal/api/mempool", { redirect: "follow" });
    expect(response.status).toBe(302);
    expect(request).toHaveBeenCalledOnce();
  });

  it("stops waiting for DNS when the caller aborts", async () => {
    const lookup = vi.fn(() => new Promise<never>(() => undefined));
    const request = vi.fn();
    const fetcher = createSafeSourceFetch({ lookup, request });
    const controller = new AbortController();
    const pending = fetcher("http://node.internal/api/mempool", { signal: controller.signal });
    controller.abort(new Error("caller stopped"));

    const outcome = await Promise.race([
      pending.then(() => "resolved", (error: unknown) => error instanceof Error ? error.message : "rejected"),
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 10)),
    ]);
    expect(outcome).toBe("caller stopped");
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps TLS verification and SNI bound to the original hostname", () => {
    const options = buildPinnedRequestOptions(
      new URL("https://node.internal:8443/api/mempool"),
      {},
      { address: "10.0.0.8", family: 4 },
    );
    expect(options).toMatchObject({
      hostname: "10.0.0.8",
      servername: "node.internal",
      rejectUnauthorized: true,
      port: "8443",
    });
    expect(options.headers).toMatchObject({ host: "node.internal:8443" });
  });
});

describe("source response body limit", () => {
  const fourMiB = 4 * 1024 * 1024;

  it("accepts a response at the exact four MiB limit", async () => {
    const body = await readResponseBodyWithLimit(chunks(
      new Uint8Array(fourMiB - 1),
      new Uint8Array(1),
    ));

    expect(body.byteLength).toBe(fourMiB);
  });

  it("rejects and aborts a response over four MiB", async () => {
    const abort = vi.fn();

    await expect(readResponseBodyWithLimit(chunks(
      new Uint8Array(fourMiB),
      new Uint8Array(1),
    ), abort)).rejects.toThrow("Mempool source response is too large");
    expect(abort).toHaveBeenCalledOnce();
  });
});

async function* chunks(...values: Uint8Array[]) {
  yield* values;
}
