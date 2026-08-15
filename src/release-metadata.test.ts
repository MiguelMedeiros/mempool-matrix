import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const read = (file: string) => {
  try {
    return readFileSync(path.join(repositoryRoot, file), "utf8");
  } catch {
    return "";
  }
};
const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const changelog = read("CHANGELOG.md");
const readme = read("README.md");
const dockerGuide = read("docs/docker.md");
const releaseGuide = read("docs/releasing.md");
const containerWorkflow = read(".github/workflows/container.yml");

const releaseVersion = "1.0.1";
const baselineReleaseTag = "v1.0.0";
const nodeBaseline = ">=22.22.0";

describe("public release metadata contract", () => {
  it("aligns application and lockfile metadata without enabling npm publication", () => {
    expect(packageJson.version).toBe(releaseVersion);
    expect(packageLock.version).toBe(releaseVersion);
    expect(packageLock.packages[""].version).toBe(releaseVersion);
    expect(packageJson.private).toBe(true);
    expect(packageJson.engines.node).toBe(nodeBaseline);
    expect(packageLock.packages[""].engines.node).toBe(nodeBaseline);
  });

  it("records the current security patch and preserves the public baseline", () => {
    expect(changelog).toContain(`## [${releaseVersion}] - 2026-08-15`);
    expect(changelog).toMatch(/js-yaml/i);
    expect(changelog).toMatch(/brace-expansion/i);
    expect(changelog).toMatch(/nanoid/i);
    expect(changelog).toContain("## [1.0.0] - 2026-07-27");
    expect(changelog).toMatch(/visualiz|visual experience/i);
    expect(changelog).toMatch(/SSRF/i);
    expect(changelog).toMatch(/history|historical/i);
    expect(changelog).toMatch(/non-root/i);
    expect(changelog).toMatch(/SBOM/i);
    expect(changelog).not.toMatch(/private (?:tag|release|version|history)/i);
  });

  it("documents the pre-tag source-build path and future immutable image workflow", () => {
    for (const document of [readme, dockerGuide]) {
      expect(document).toMatch(/before the first public (?:SemVer )?tag/i);
      expect(document).toMatch(/build from source|build the checkout locally/i);
      expect(document).toMatch(/SemVer tags?\s+(?:publish|trigger)/i);
      expect(document).toMatch(/linux\/amd64.*linux\/arm64|multi-architecture/i);
      expect(document).toMatch(/SBOM/i);
      expect(document).toMatch(/provenance/i);
      expect(document).not.toMatch(/docker pull\s+ghcr\.io/i);
    }
    expect(readme).toContain("Node.js 22.22 or newer");
    expect(readme).toContain("node-%3E%3D22.22");
  });

  it("keeps the release checklist gated and does not claim publication already happened", () => {
    for (const gate of [
      "explicit approval",
      "repository visibility",
      baselineReleaseTag,
      "workflow",
      "digest",
      "SBOM",
      "provenance",
      "GitHub Release",
      "package visibility",
      "production",
      "site commit",
      "Umbrel",
    ]) {
      expect(releaseGuide).toContain(gate);
    }
    expect(releaseGuide).toMatch(/preserve (?:the )?existing tags/i);
    expect(releaseGuide).toMatch(/after explicit approval/i);
    expect(releaseGuide).not.toMatch(/delete the old private tags/i);
    expect(releaseGuide).not.toMatch(/has been published|is now public|official Umbrel/i);
  });

  it("keeps workflow output aligned with the documented release candidate", () => {
    expect(containerWorkflow).toContain('tags: ["v*"]');
    expect(containerWorkflow).toContain("type=semver,pattern={{version}}");
    expect(containerWorkflow).toContain("platforms: linux/amd64,linux/arm64");
    expect(containerWorkflow).toContain("provenance: mode=max");
    expect(containerWorkflow).toContain("sbom: true");
    expect(containerWorkflow).toContain("digest=$DIGEST");
  });
});
