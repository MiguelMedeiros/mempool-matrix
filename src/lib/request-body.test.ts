import { describe, expect, it, vi } from "vitest";
import { readLimitedJsonObject } from "./request-body";

const requestWithStream = (chunks: Uint8Array[], contentType = "application/json") => {
  let pulled = 0;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pulled++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel,
  });
  const request = new Request("http://local/settings", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return { request, cancel, pulled: () => pulled };
};

describe("readLimitedJsonObject", () => {
  it("cancels an oversized streaming body before consuming later chunks", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode(`{"value":"${"a".repeat(1_500)}`),
      encoder.encode("b".repeat(1_500)),
      encoder.encode("c".repeat(1_500)),
      encoder.encode("this chunk must not be consumed"),
      encoder.encode('"}'),
    ];
    const streamed = requestWithStream(chunks);

    await expect(readLimitedJsonObject(streamed.request, 4_096)).resolves.toEqual({
      ok: false,
      kind: "oversized",
      message: "Request body is too large.",
    });
    expect(streamed.cancel).toHaveBeenCalledTimes(1);
    expect(streamed.pulled()).toBeLessThan(chunks.length);
  });

  it("decodes UTF-8 split across chunks and accepts exactly the byte limit", async () => {
    const encoder = new TextEncoder();
    const fixed = encoder.encode('{"value":"é"}').byteLength;
    const text = `{"value":"${"x".repeat(4_096 - fixed)}é"}`;
    const encoded = encoder.encode(text);
    expect(encoded.byteLength).toBe(4_096);
    const multibyteStart = encoded.lastIndexOf(0xc3);
    const streamed = requestWithStream([
      encoded.slice(0, multibyteStart + 1),
      encoded.slice(multibyteStart + 1),
    ]);

    const result = await readLimitedJsonObject(streamed.request, 4_096);

    expect(result).toEqual({ ok: true, value: { value: `${"x".repeat(4_096 - fixed)}é` } });
    expect(streamed.cancel).not.toHaveBeenCalled();
  });

  it.each([
    "application/json",
    " Application/JSON ; charset=utf-8 ",
    'application/json; charset="utf-8"',
    'application/json; profile="quoted value"; version=v1',
  ])(
    "accepts the JSON media type %s",
    async (contentType) => {
      const streamed = requestWithStream([new TextEncoder().encode('{"ok":true}')], contentType);
      await expect(readLimitedJsonObject(streamed.request, 4_096)).resolves.toEqual({
        ok: true,
        value: { ok: true },
      });
    },
  );

  it.each(["application/jsonp", "application/json-evil", "text/plain", ""])(
    "rejects the non-JSON media type %s",
    async (contentType) => {
      const streamed = requestWithStream([new TextEncoder().encode('{"ok":true}')], contentType);
      await expect(readLimitedJsonObject(streamed.request, 4_096)).resolves.toEqual({
        ok: false,
        kind: "invalid",
        message: "Content-Type must be application/json.",
      });
    },
  );

  it.each([
    "application/json; garbage",
    "application/json; charset",
    "application/json;",
    "application/json;; charset=utf-8",
    "application/json; charset=",
    'application/json; charset="unterminated',
    "application/json; char(set=utf-8",
  ])("rejects malformed MIME parameters in %s", async (contentType) => {
    const streamed = requestWithStream([new TextEncoder().encode('{"ok":true}')], contentType);
    await expect(readLimitedJsonObject(streamed.request, 4_096)).resolves.toEqual({
      ok: false,
      kind: "invalid",
      message: "Content-Type must be application/json.",
    });
  });
});
