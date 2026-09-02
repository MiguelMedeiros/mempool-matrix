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
const securityPolicy = read("SECURITY.md");
const containerWorkflow = read(".github/workflows/container.yml");

const releaseVersion = "1.0.1";
const publishedImage = `ghcr.io/miguelmedeiros/mempool-matrix:${releaseVersion}`;
const publishedDigest = "sha256:1dd72c603989dfa53c1089136c6aafca006de815b95545283ec0ee8ab26cab42";
const supportedReleaseLine = "1.0.x";
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

  it("documents current published-image and source-build workflows", () => {
    for (const document of [readme, dockerGuide]) {
      expect(document).toContain(publishedImage);
      expect(document).toContain(publishedDigest);
      expect(document).toMatch(/build from source|build the checkout locally|source build/i);
      expect(document).toMatch(/linux\/amd64.*linux\/arm64|multi-architecture/i);
      expect(document).toMatch(/SBOM/i);
      expect(document).toMatch(/provenance/i);
      expect(document).not.toMatch(/before the first public (?:SemVer )?tag/i);
    }
    expect(readme).toContain(`MEMPOOL_MATRIX_IMAGE=${publishedImage}`);
    expect(dockerGuide).toContain(`docker pull ${publishedImage}`);
    expect(dockerGuide).toContain(`ghcr.io/miguelmedeiros/mempool-matrix@${publishedDigest}`);
    expect(dockerGuide).toContain("${VERIFIED_INDEX_DIGEST}");
    expect(dockerGuide).not.toContain("sha256:<");
    expect(readme).toContain("Node.js 22.22 or newer");
    expect(readme).toContain("node-%3E%3D22.22");
  });

  it("keeps a reusable release checklist with exact-revision verification", () => {
    for (const gate of [
      "SemVer",
      "workflow",
      "digest",
      "SBOM",
      "provenance",
      "GitHub Release",
      "package visibility",
      "production",
      "revision",
      "Umbrel",
    ]) {
      expect(releaseGuide).toContain(gate);
    }
    expect(releaseGuide).toContain(`Current stable release: \`v${releaseVersion}\``);
    expect(releaseGuide).toMatch(/preserve (?:all )?(?:existing|historical) tags/i);
    expect(releaseGuide).not.toMatch(/1\.0\.0 candidate|before the first public tag/i);
    expect(releaseGuide).not.toMatch(/delete the old private tags/i);
    expect(releaseGuide).not.toMatch(/official Umbrel/i);
  });

  it("documents the current supported release and private reporting path", () => {
    expect(securityPolicy).toContain(`| ${supportedReleaseLine} |`);
    expect(securityPolicy).toContain("GitHub private vulnerability reporting");
    expect(securityPolicy).not.toMatch(/has not yet published|repository remains private/i);
    expect(readme).toContain("GitHub private vulnerability reporting");
    expect(readme).not.toMatch(/before the repository is published/i);
  });

  it("keeps workflow output aligned with the documented release workflow", () => {
    expect(containerWorkflow).toContain('tags: ["v*"]');
    expect(containerWorkflow).toContain("type=semver,pattern={{version}}");
    expect(containerWorkflow).toContain("platforms: linux/amd64,linux/arm64");
    expect(containerWorkflow).toContain("provenance: mode=max");
    expect(containerWorkflow).toContain("sbom: true");
    expect(containerWorkflow).toContain("digest=$DIGEST");
  });
});
