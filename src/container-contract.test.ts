import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(repositoryRoot, file), "utf8");

const nodeDigest = "sha256:8516dce0483394d5708d4b2ee6cacb79fb1d617ea4e2787c2120bcca92ce372e";

describe("standalone container contract", () => {
  it("preserves Next.js settings while excluding non-runtime files from route traces", () => {
    const config = read("next.config.ts");
    expect(config).toContain('output: "standalone"');
    expect(config).toContain("turbopack:");
    expect(config).toContain('path: "**/next.config.ts"');
    expect(config).toContain("outputFileTracingExcludes:");
    expect(config).toContain('"/*": nonRuntimeProjectFiles');

    for (const excluded of [
      '"src/**/*"',
      '"docs/**/*"',
      '"assets/**/*"',
      '"scripts/**/*"',
      '"coverage/**/*"',
      '".git/**/*"',
      '".hermes/**/*"',
      '"*.md"',
      '"Dockerfile"',
      '"docker-compose*.yml"',
      '"package-lock.json"',
      '"eslint.config.*"',
      '"postcss.config.*"',
      '"vitest.config.*"',
      '"tsconfig*.json"',
      '"next.config.*"',
      '".env*"',
      '"*.pem"',
      '"*.key"',
      '"*.p12"',
    ]) {
      expect(config).toContain(excluded);
    }
    expect(config).not.toContain('"**/*"');
  });

  it("keeps Vitest defaults and ignores local Next build output", () => {
    const config = read("vitest.config.mts");
    expect(config).toContain("configDefaults");
    expect(config).toMatch(/exclude:\s*\[\.\.\.configDefaults\.exclude,\s*["']\.next\/\*\*["']\]/);
  });

  it("pins the supported Node base and Dockerfile frontend", () => {
    const dockerfile = read("Dockerfile");
    const pinnedBase = `node:22.23.1-alpine3.23@${nodeDigest}`;
    expect(dockerfile).toMatch(/^# syntax=docker\/dockerfile:[^\s]+@sha256:[a-f0-9]{64}$/m);
    expect(dockerfile.match(/^FROM /gm)).toHaveLength(3);
    expect(dockerfile.match(new RegExp(`^FROM ${pinnedBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} AS \\w+$`, "gm"))).toHaveLength(3);
    expect(dockerfile).not.toMatch(/^ARG NODE_IMAGE/m);
    expect(dockerfile).not.toContain("FROM ${NODE_IMAGE}");
    expect(dockerfile).toContain(`org.opencontainers.image.base.digest="${nodeDigest}"`);
  });

  it("builds standalone output with the optional public origin", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("ARG NEXT_PUBLIC_SITE_URL");
    expect(dockerfile).toContain("ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}");
    expect(dockerfile).toContain("RUN npm ci --no-audit --no-fund");
    expect(dockerfile).toContain("RUN npm run build");
  });

  it("runs only traced assets as uid 1000 without npm tooling", () => {
    const dockerfile = read("Dockerfile");
    const runner = dockerfile.slice(dockerfile.indexOf(" AS runner"));
    expect(runner).not.toContain("/app/.next/standalone ./");
    expect(runner).toContain("/app/.next/standalone/server.js ./server.js");
    expect(runner).toContain("/app/.next/standalone/package.json ./package.json");
    expect(runner).toContain("/app/.next/standalone/node_modules ./node_modules");
    expect(runner).toContain("/app/.next/standalone/.next ./.next");
    expect(runner).toContain("/app/.next/static ./.next/static");
    expect(runner).toContain("/app/public ./public");
    expect(runner).not.toContain("/app/package-lock.json");
    expect(runner).toContain("apk upgrade --no-cache libcrypto3 libssl3");
    expect(runner).toContain("/usr/local/lib/node_modules/npm");
    expect(runner).toContain("/opt/yarn");
    expect(runner).toContain("USER 1000:1000");
    expect(runner).toContain("chown 1000:1000 /data");
    expect(runner).toContain("STOPSIGNAL SIGTERM");
    expect(runner).toContain('["node", "server.js"]');
    expect(runner).toContain("/api/health");
  });

  it("excludes repositories, dependencies, build output, secrets, and data", () => {
    const ignored = read(".dockerignore").split(/\r?\n/);
    for (const entry of [
      ".git",
      ".github",
      ".hermes",
      "node_modules",
      ".next",
      "coverage",
      "data",
      ".env",
      ".env.*",
      ".npmrc",
      ".yarnrc*",
      ".vercel",
      ".data",
      "*.pem",
      "*.key",
      "*.p12",
    ]) {
      expect(ignored).toContain(entry);
    }
  });

  it("smoke testing owns only its default image and exercises a fresh Compose volume", () => {
    const smoke = read("scripts/smoke-container.sh");
    expect(smoke).toContain("mempool-matrix:smoke-$$");
    expect(smoke).toMatch(/IMAGE_EXPLICIT|image_explicit/);
    expect(smoke).toMatch(/BUILT|built/);
    expect(smoke).toContain("docker image rm");
    expect(smoke).toContain("down --volumes");
    expect(smoke).toContain("--env-file");
    expect(smoke).toContain("--no-build");
    expect(smoke).toContain("--force-recreate");
    expect(smoke).toMatch(/trap ['"]exit 130['"] INT/);
    expect(smoke).toMatch(/trap ['"]exit 143['"] TERM/);
    expect(smoke).toContain("assert_runtime_surface");
    expect(smoke).not.toContain("chmod 0777");
    expect(smoke).toContain('chown 1000:1000 /data');
    for (const excludedPath of [
      "/app/src",
      "/app/docs",
      "/app/assets",
      "/app/scripts",
      "/app/package-lock.json",
      "/app/next.config.ts",
      "/app/vitest.config.mts",
      "/app/tsconfig.json",
      "/app/eslint.config.mjs",
      "/app/postcss.config.mjs",
    ]) {
      expect(smoke).toContain(excludedPath);
    }
  });
});
