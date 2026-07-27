import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const workflowPath = path.join(repositoryRoot, ".github/workflows/container.yml");
const workflow = (() => {
  try {
    return readFileSync(workflowPath, "utf8");
  } catch {
    return "";
  }
})();
const ciWorkflow = readFileSync(path.join(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
const secretScanWorkflow = readFileSync(
  path.join(repositoryRoot, ".github/workflows/secret-scan.yml"),
  "utf8",
);
const checkoutNode24Pin =
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const setupNode24Pin =
  "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020";

const job = (name: string, next?: string) => {
  const start = workflow.indexOf(`  ${name}:`);
  if (start < 0) return "";
  const end = next ? workflow.indexOf(`  ${next}:`, start + 1) : workflow.length;
  return workflow.slice(start, end < 0 ? workflow.length : end);
};

const validate = job("validate", "publish");
const publish = job("publish");

describe("container workflow security contract", () => {
  it("validates pull requests, main pushes, SemVer-candidate tags, and manual runs", () => {
    expect(workflow).toMatch(/pull_request:\s*\n\s+branches:\s*\[main\]/);
    expect(workflow).toMatch(/push:\s*\n\s+branches:\s*\[main\]\s*\n\s+tags:\s*\["v\*"\]/);
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toMatch(/publish:\s*\n\s+description:.*\n\s+required: true\s*\n\s+type: boolean\s*\n\s+default: false/);
  });

  it("keeps workflow permissions read-only and grants packages write only to publish", () => {
    expect(workflow).toMatch(/^permissions:\s*\n\s+contents: read$/m);
    expect(validate).not.toContain("packages: write");
    expect(publish).toMatch(/permissions:\s*\n\s+contents: read\s*\n\s+packages: write/);
    expect((workflow.match(/packages: write/g) ?? [])).toHaveLength(1);
  });

  it("uses native amd64 and arm64 validation runners with isolated caches", () => {
    expect(validate).toMatch(/arch: amd64\s*\n\s+platform: linux\/amd64\s*\n\s+runner: ubuntu-latest/);
    expect(validate).toMatch(/arch: arm64\s*\n\s+platform: linux\/arm64\s*\n\s+runner: ubuntu-24\.04-arm/);
    expect(validate).toContain("scope=container-validate-${{ matrix.arch }}");
    expect(publish).toContain("scope=container-publish");
    expect(publish).not.toContain("scope=container-${{ matrix.arch }}");
  });

  it("pins every third-party action to a verified commit SHA", () => {
    const uses = [...workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+).*$/gm)].map((match) => match[1]);
    const verifiedPins = new Set([
      checkoutNode24Pin,
      "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
      "docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a",
      "docker/login-action@abd2ef45e78c5afb21d64d4ca52ee8550d9572c7",
      "docker/metadata-action@dc802804100637a589fabce1cb79ff13a1411302",
      "docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c",
      "docker/setup-qemu-action@96fe6ef7f33517b61c61be40b68a1882f3264fb8",
    ]);
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) {
      expect(action).toMatch(/^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/);
      expect(verifiedPins.has(action)).toBe(true);
    }
  });

  it("uses Node 24 action runtimes across every workflow", () => {
    expect(workflow).toContain(checkoutNode24Pin);
    expect(ciWorkflow).toContain(checkoutNode24Pin);
    expect(secretScanWorkflow).toContain(checkoutNode24Pin);
    expect(ciWorkflow).toContain(setupNode24Pin);
    expect(ciWorkflow).toContain("node-version: 22.23.1");

    for (const source of [workflow, ciWorkflow, secretScanWorkflow]) {
      expect(source).not.toMatch(/actions\/(?:checkout|setup-node)@v[1-6](?:\s|$)/m);
      expect(source).not.toContain(
        "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      );
    }
  });

  it("builds and exercises a local image before a blocking Trivy scan", () => {
    expect(validate).toContain("platforms: ${{ matrix.platform }}");
    expect(validate).toContain("load: true");
    expect(validate).toContain("push: false");
    expect(validate).toContain("SMOKE_SKIP_BUILD: \"1\"");
    expect(validate).toContain("run: ./scripts/smoke-container.sh");
    expect(validate).toContain("aquasecurity/trivy-action@");
    expect(validate).toMatch(/ignore-unfixed:\s*false/);
    expect(validate).toMatch(/severity:\s*HIGH,CRITICAL/);
    expect(validate).toMatch(/exit-code:\s*"1"/);
  });

  it("cannot publish from a branch push and requires explicit manual consent", () => {
    const condition = publish.match(/\n\s+if:\s*>-\s*\n([\s\S]*?)\n\s+runs-on:/)?.[1] ?? "";
    expect(condition).toContain("github.event_name == 'push'");
    expect(condition).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(condition).toContain("github.event_name == 'workflow_dispatch'");
    expect(condition).toContain("inputs.publish == true");
    expect(condition).not.toMatch(/github\.event_name == 'push'\s*\|\|/);
    expect(publish).toContain("Require a strict SemVer release tag");
    expect(publish).toContain('ref.startsWith("refs/tags/")');
    expect(publish).toMatch(/new RegExp\(`\^v/);
    expect(publish).toContain("!semver.test(tag)");
    expect(publish).toContain("process.exit(1)");
    expect(publish.indexOf("Require a strict SemVer release tag")).toBeLessThan(publish.indexOf("Log in to GHCR"));
  });

  it("publishes coherent multi-architecture metadata with attestations", () => {
    expect(publish).toContain("ghcr.io/miguelmedeiros/mempool-matrix");
    expect(publish).toContain("needs: validate");
    expect(publish).toContain("platforms: linux/amd64,linux/arm64");
    expect(publish).toContain("type=semver,pattern={{version}}");
    expect(publish).toContain("type=sha,prefix=sha-");
    expect(publish).toContain("provenance: mode=max");
    expect(publish).toContain("sbom: true");
    for (const argument of ["OCI_SOURCE", "OCI_REVISION", "OCI_VERSION", "OCI_LICENSES"]) {
      expect(validate).toContain(`${argument}=`);
      expect(publish).toContain(`${argument}=`);
    }
  });

  it("records the immutable published digest in the job summary", () => {
    expect(publish).toContain("${{ steps.build.outputs.digest }}");
    expect(publish).toContain("$GITHUB_STEP_SUMMARY");
    expect(publish).toContain("digest=$DIGEST");
  });
});
