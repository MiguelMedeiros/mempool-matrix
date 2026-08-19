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

function topLevelBlock(source: string, heading: string) {
  const lines = source.split("\n");
  const start = lines.indexOf(`${heading}:`);
  if (start === -1) return [];

  const block: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length > 0 && !line.startsWith(" ")) break;
    if (line.startsWith("  ")) block.push(line.trim());
  }
  return block;
}

describe("CodeQL workflow contract", () => {
  it("scans JavaScript and TypeScript on changes to main and on a weekly schedule", () => {
    expect(workflow).toContain("name: CodeQL");
    expect(workflow).toMatch(/push:\s*\n\s+branches: \[main\]/);
    expect(workflow).toMatch(/pull_request:\s*\n\s+branches: \[main\]/);
    expect(workflow).toMatch(/schedule:\s*\n\s+- cron: ["']\d+ \d+ \* \* \d["']/);
    expect(workflow).toContain("languages: javascript-typescript");
  });

  it("uses least privilege and pins every third-party action to an immutable commit", () => {
    const permissions = topLevelBlock(workflow, "permissions");
    expect(permissions).toContain("contents: read");
    expect(permissions).toContain("security-events: write");
    expect(workflow).toContain(`actions/checkout@${checkoutSha}`);
    expect(workflow).toContain(`github/codeql-action/init@${codeqlSha}`);
    expect(workflow).toContain(`github/codeql-action/analyze@${codeqlSha}`);
    expect(workflow).not.toMatch(/uses:\s+[^\s]+@(?![0-9a-f]{40}(?:\s|$))/m);
  });

  it("avoids ambiguous repeated-line regular expressions in permission checks", () => {
    const source = readFileSync(import.meta.filename, "utf8");
    const ambiguousPrefix = ["permissions:", String.raw`\s*\n`, String.raw`(?:\s+[^\n]+\n)*?\s+`].join("");

    expect(source).not.toContain(ambiguousPrefix);
  });

  it("scans adversarially long permission blocks in linear order", () => {
    const source = ["permissions:", ...Array.from({ length: 10_000 }, () => "  "), "  contents: read", "jobs:"].join("\n");

    expect(topLevelBlock(source, "permissions")).toContain("contents: read");
  });

  it("uses buildless analysis with bounded execution and deduplicated runs", () => {
    expect(workflow).toContain("build-mode: none");
    expect(workflow).toContain("timeout-minutes: 20");
    expect(workflow).toMatch(/concurrency:\s*\n\s+group: codeql-/);
    expect(workflow).toContain("cancel-in-progress: true");
  });
});
