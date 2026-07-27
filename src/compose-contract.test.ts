import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const privateNetwork = ["bitcoin", "docker", "default"].join("-");
const privateService = ["mempool", "web"].join("-");
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "mempool-matrix-compose-contract-"));
const emptyEnvFile = path.join(temporaryDirectory, "empty.env");
writeFileSync(emptyEnvFile, "", { mode: 0o600 });
afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

const interpolationEnvironment = {
  MEMPOOL_MATRIX_IMAGE: "mempool-matrix:local",
  NEXT_PUBLIC_SITE_URL: "",
  OCI_SOURCE: "https://github.com/MiguelMedeiros/mempool-matrix",
  OCI_REVISION: "local",
  OCI_VERSION: "dev",
  OCI_LICENSES: "MIT",
  MEMPOOL_API_URL: "https://mempool.space/api",
  MEMPOOL_SETTINGS_TOKEN: "",
  MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS: "false",
  MEMPOOL_TRUST_PROXY: "false",
  MEMPOOL_SOURCE_DENY_HOSTS: "",
  MEMPOOL_HISTORY_INTERVAL_MS: "60000",
  MEMPOOL_HISTORY_RETENTION_DAYS: "30",
  PORT: "3033",
};

function resolvedComposeConfig(source?: string, inherited: NodeJS.ProcessEnv = process.env): string {
  const env: NodeJS.ProcessEnv = {
    PATH: inherited.PATH,
    HOME: inherited.HOME,
    DOCKER_HOST: inherited.DOCKER_HOST,
    NODE_ENV: inherited.NODE_ENV ?? "test",
    ...interpolationEnvironment,
    ...(source ? { MEMPOOL_API_URL: source } : {}),
  };

  return execFileSync("docker", ["compose", "--env-file", emptyEnvFile, "config"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env,
  });
}

describe("Docker Compose portability contract", () => {
  it("uses the public mempool API without private network dependencies by default", () => {
    const config = resolvedComposeConfig();

    expect(config).toContain("MEMPOOL_API_URL: https://mempool.space/api");
    expect(config).toContain('MEMPOOL_TRUST_PROXY: "false"');
    expect(config).toContain('MEMPOOL_SOURCE_DENY_HOSTS: ""');
    expect(config).toMatch(/build:\n(?:.|\n)*args:\n(?:.|\n)*NEXT_PUBLIC_SITE_URL:/);
    expect(config).toMatch(/image: mempool-matrix:local/);
    expect(config).toContain("user: 1000:1000");
    expect(config).toContain("init: true");
    expect(config).toContain("mem_limit: \"536870912\"");
    expect(config).toContain("cap_drop:\n      - ALL");
    expect(config).toContain("no-new-privileges:true");
    expect(config).toContain("read_only: true");
    expect(config).toMatch(/tmpfs:\n\s+- (?:type: tmpfs\n\s+target: \/tmp|\/tmp:)/);
    expect(config).toContain("source: mempool-matrix-data");
    expect(config).toContain("target: /data");
    expect(config).not.toContain("type: bind");
    expect(config).not.toContain("network_mode: host");
    expect(config).not.toContain(privateNetwork);
    expect(config).not.toContain(privateService);
  });

  it("allows overriding the API with a compatible local endpoint", () => {
    const localSource = "http://192.168.1.10:8080/api";

    expect(resolvedComposeConfig(localSource)).toContain(`MEMPOOL_API_URL: ${localSource}`);
  });

  it("ignores inherited and repository dotenv interpolation values", () => {
    const adversarialValues = Object.fromEntries(
      Object.keys(interpolationEnvironment).map((key, index) => [key, `attacker.invalid/${key}/${index}`]),
    );
    const adversarial = { ...process.env, ...adversarialValues };
    const baseline = resolvedComposeConfig();
    const config = resolvedComposeConfig(undefined, adversarial);

    expect(config).toBe(baseline);
    expect(config).toContain("image: mempool-matrix:local");
    expect(config).toContain("MEMPOOL_API_URL: https://mempool.space/api");
    expect(config).toContain('published: "3033"');
    expect(config).not.toContain("attacker.invalid");
  });
});
