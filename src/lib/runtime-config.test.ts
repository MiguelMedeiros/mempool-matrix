import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearRuntimeConfigCache,
  getActiveMempoolSource,
  getPublicDataSourceStatus,
  SAFE_DEFAULT_MEMPOOL_API_URL,
  saveRuntimeConfig,
} from "./runtime-config";

const directories: string[] = [];

afterEach(async () => {
  clearRuntimeConfigCache();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe("runtime data-source configuration", () => {
  it("uses file, environment, then safe default precedence", async () => {
    const directory = await temporaryDirectory();
    const configPath = path.join(directory, "runtime-config.json");

    expect((await getActiveMempoolSource(configPath, "http://env-node/api"))).toMatchObject({
      baseUrl: "http://env-node/api",
      source: "env",
    });
    expect((await getActiveMempoolSource(configPath, undefined))).toMatchObject({
      baseUrl: SAFE_DEFAULT_MEMPOOL_API_URL,
      source: "default",
    });
    expect((await getActiveMempoolSource(configPath, "file:///unsafe"))).toMatchObject({
      baseUrl: SAFE_DEFAULT_MEMPOOL_API_URL,
      source: "default",
    });

    await saveRuntimeConfig({
      baseUrl: "http://file-node:8080/api",
      label: "file node",
    }, configPath, new Date("2026-07-15T04:00:00.000Z"));

    expect((await getActiveMempoolSource(configPath, "http://env-node/api"))).toMatchObject({
      baseUrl: "http://file-node:8080/api",
      label: "file node",
      source: "file",
      updatedAt: "2026-07-15T04:00:00.000Z",
    });
  });

  it("writes atomically and hot-reloads a replacement", async () => {
    const directory = await temporaryDirectory();
    const configPath = path.join(directory, "nested", "runtime-config.json");
    await saveRuntimeConfig({ baseUrl: "http://first/api" }, configPath);
    expect((await getActiveMempoolSource(configPath)).baseUrl).toBe("http://first/api");

    await saveRuntimeConfig({ baseUrl: "http://second/api" }, configPath);
    expect((await getActiveMempoolSource(configPath)).baseUrl).toBe("http://second/api");
    expect(await readdir(path.dirname(configPath))).toEqual(["runtime-config.json"]);

    const persisted = JSON.parse(await readFile(configPath, "utf8")) as { baseUrl: string };
    expect(persisted.baseUrl).toBe("http://second/api");
  });

  it("returns editable values only to authorized settings requests", async () => {
    const directory = await temporaryDirectory();
    const configPath = path.join(directory, "runtime-config.json");
    await saveRuntimeConfig({
      baseUrl: "http://private-node:8080/api",
      label: "private node",
    }, configPath);

    await expect(getPublicDataSourceStatus(true, configPath)).resolves.toMatchObject({
      configuration: {
        baseUrl: "http://private-node:8080/api",
        label: "private node",
      },
      canConfigure: true,
    });
    expect(await getPublicDataSourceStatus(false, configPath)).not.toHaveProperty("configuration");
  });

  it("reports the actual validated API path prefix", async () => {
    const directory = await temporaryDirectory();
    const configPath = path.join(directory, "runtime-config.json");
    await saveRuntimeConfig({ baseUrl: "http://private-node/custom/api" }, configPath);
    await expect(getPublicDataSourceStatus(false, configPath)).resolves.toMatchObject({
      pathPrefix: "/custom/api",
    });
  });

  it("ignores malformed persisted configuration", async () => {
    const directory = await temporaryDirectory();
    const configPath = path.join(directory, "runtime-config.json");
    await writeFile(configPath, JSON.stringify({
      version: 1,
      type: "mempool-api",
      baseUrl: "file:///etc/passwd",
      updatedAt: new Date().toISOString(),
    }));

    expect((await getActiveMempoolSource(configPath, "http://env-node/api"))).toMatchObject({
      baseUrl: "http://env-node/api",
      source: "env",
    });
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "mempool-config-"));
  directories.push(directory);
  return directory;
}
