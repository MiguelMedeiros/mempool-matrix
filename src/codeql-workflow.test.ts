import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const workflowPath = path.join(repositoryRoot, ".github/workflows/codeql.yml");
const workflow = (() => {
  try {
    return readFileSync(workflowPath, "utf8");
  } catch {
    return "";
  }
})();

const checkoutSha = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const codeqlSha = "ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd";

describe("CodeQL workflow contract", () => {
  it("scans JavaScript and TypeScript on changes to main and on a weekly schedule", () => {
    expect(workflow).toContain("name: CodeQL");
    expect(workflow).toMatch(/push:\s*\n\s+branches: \[main\]/);
    expect(workflow).toMatch(/pull_request:\s*\n\s+branches: \[main\]/);
    expect(workflow).toMatch(/schedule:\s*\n\s+- cron: ["']\d+ \d+ \* \* \d["']/);
    expect(workflow).toContain("languages: javascript-typescript");
  });

  it("uses least privilege and pins every third-party action to an immutable commit", () => {
    expect(workflow).toMatch(/permissions:\s*\n(?:\s+[^\n]+\n)*?\s+contents: read/);
    expect(workflow).toMatch(/permissions:\s*\n(?:\s+[^\n]+\n)*?\s+security-events: write/);
    expect(workflow).toContain(`actions/checkout@${checkoutSha}`);
    expect(workflow).toContain(`github/codeql-action/init@${codeqlSha}`);
    expect(workflow).toContain(`github/codeql-action/analyze@${codeqlSha}`);
    expect(workflow).not.toMatch(/uses:\s+[^\s]+@(?![0-9a-f]{40}(?:\s|$))/m);
  });

  it("uses buildless analysis with bounded execution and deduplicated runs", () => {
    expect(workflow).toContain("build-mode: none");
    expect(workflow).toContain("timeout-minutes: 20");
    expect(workflow).toMatch(/concurrency:\s*\n\s+group: codeql-/);
    expect(workflow).toContain("cancel-in-progress: true");
  });
});
