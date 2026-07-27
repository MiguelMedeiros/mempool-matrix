import { describe, expect, it } from "vitest";
import {
  SourceValidationError,
  validateMempoolSource,
} from "./source-validator";

describe("validateMempoolSource", () => {
  it("accepts and normalizes compatible private API URLs", () => {
    expect(validateMempoolSource({
      baseUrl: " http://mempool-web:8080/api/ ",
      label: " zero node ",
    })).toEqual({
      baseUrl: "http://mempool-web:8080/api",
      label: "zero node",
    });
    expect(validateMempoolSource({
      baseUrl: "http://100.67.121.90:3000",
    }).baseUrl).toBe("http://100.67.121.90:3000/api");
  });

  it.each([
    ["file:///data/node", "unsupported-protocol"],
    ["ftp://node.example/api", "unsupported-protocol"],
    ["http://user:secret@node.example/api", "credentials-not-allowed"],
    ["http://169.254.169.254/api", "metadata-endpoint"],
    ["http://169.254.170.2/api", "metadata-endpoint"],
    ["http://[fd00:ec2::254]/api", "metadata-endpoint"],
    ["http://metadata.google.internal/api", "metadata-endpoint"],
    ["http://node.example/rest", "must-end-with-api"],
    ["http://node.example/api?token=secret", "invalid-url"],
  ])("rejects unsafe source %s", (baseUrl, code) => {
    expect(() => validateMempoolSource({ baseUrl })).toThrowError(
      expect.objectContaining<Partial<SourceValidationError>>({ code }),
    );
  });

  it("blocks configured hosts and excessive URLs", () => {
    expect(() => validateMempoolSource(
      { baseUrl: "http://blocked.internal/api" },
      "other.internal, blocked.internal",
    )).toThrowError(expect.objectContaining({ code: "metadata-endpoint" }));
    expect(() => validateMempoolSource({
      baseUrl: `https://example.com/${"a".repeat(2050)}/api`,
    })).toThrowError(expect.objectContaining({ code: "url-too-long" }));
  });
});
