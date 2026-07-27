import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const privateNetwork = ["bitcoin", "docker", "default"].join("-");
const privateService = ["mempool", "web"].join("-");

function resolvedComposeConfig(source?: string): string {
  const env = { ...process.env };
  if (source) env.MEMPOOL_API_URL = source;
  else delete env.MEMPOOL_API_URL;

  return execFileSync("docker", ["compose", "config"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env,
  });
}

describe("Docker Compose portability contract", () => {
  it("uses the public mempool API without private network dependencies by default", () => {
    const config = resolvedComposeConfig();

    expect(config).toContain("MEMPOOL_API_URL: https://mempool.space/api");
    expect(config).toMatch(/build:\n\s+context: .+/);
    expect(config).not.toContain("network: host");
    expect(config).not.toContain(privateNetwork);
    expect(config).not.toContain(privateService);
  });

  it("allows overriding the API with a compatible local endpoint", () => {
    const localSource = "http://192.168.1.10:8080/api";

    expect(resolvedComposeConfig(localSource)).toContain(`MEMPOOL_API_URL: ${localSource}`);
  });
});
