import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

function trackedMarkdownFilesFromGitOutput(output: string): string[] {
  return output
    .split("\n")
    .filter(Boolean)
    .filter((file) => !file.split("/").includes("node_modules"));
}

const documentationFiles = trackedMarkdownFilesFromGitOutput(
  execFileSync("git", ["ls-files", "--", "*.md"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }),
);
const requiredAssets = [
  "docs/assets/readme-hero.webp",
  "docs/assets/readme-hero-mobile.webp",
  "docs/assets/og.jpg",
];

function markdownTargets(markdown: string): string[] {
  const targets: string[] = [];
  const definitions = new Map<string, string>();
  const normalizeLabel = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase();

  for (const match of markdown.matchAll(
    /^[ \t]{0,3}\[([^\]]+)\]:[ \t]*(?:<([^>\n]+)>|(\S+))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/gm,
  )) {
    definitions.set(normalizeLabel(match[1]), match[2] ?? match[3]);
  }

  for (const match of markdown.matchAll(
    /!?\[[^\]]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g,
  )) {
    targets.push(match[1] ?? match[2]);
  }

  for (const match of markdown.matchAll(/!?\[([^\]]*)\]\[([^\]]*)\]/g)) {
    const target = definitions.get(normalizeLabel(match[2] || match[1]));
    if (target) targets.push(target);
  }

  for (const tag of markdown.matchAll(/<(?:a|img|source)\b[^>]*>/gi)) {
    for (const attribute of tag[0].matchAll(/\b(href|src|srcset)=["']([^"']+)["']/gi)) {
      if (attribute[1].toLowerCase() === "srcset") {
        for (const candidate of attribute[2].split(",")) {
          const target = candidate.trim().split(/\s+/, 1)[0];
          if (target) targets.push(target);
        }
      } else {
        targets.push(attribute[2]);
      }
    }
  }

  return targets;
}

type LocalTarget =
  | { kind: "local"; resolvedPath: string }
  | { kind: "invalid"; reason: string };

function isPathInsideRepository(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

function localTarget(sourceFile: string, target: string): LocalTarget | null {
  const withoutFragment = target.split("#", 1)[0];
  if (!withoutFragment || /^(?:[a-z]+:|\/\/)/i.test(withoutFragment)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutFragment.split("?", 1)[0]);
  } catch {
    return { kind: "invalid", reason: "malformed percent encoding" };
  }
  const resolvedPath = path.resolve(repositoryRoot, path.dirname(sourceFile), decoded);
  if (!isPathInsideRepository(repositoryRoot, resolvedPath)) {
    return { kind: "invalid", reason: "path escapes repository" };
  }
  return { kind: "local", resolvedPath };
}

function privateAddressPatterns(): RegExp[] {
  return [
    new RegExp(String.raw`\b10(?:\.\d{1,3}){3}\b`),
    new RegExp(String.raw`\b192\.168(?:\.\d{1,3}){2}\b`),
    new RegExp(String.raw`\b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b`),
    new RegExp(["tail", "scale"].join(""), "i"),
  ];
}

describe("documentation link helpers", () => {
  it("keeps tracked Markdown while excluding dependency trees", () => {
    expect(
      trackedMarkdownFilesFromGitOutput(
        "README.md\ndocs/guide.md\nnode_modules/package/README.md\n",
      ),
    ).toEqual(["README.md", "docs/guide.md"]);
  });

  it("rejects traversal and absolute paths outside the repository", () => {
    expect(isPathInsideRepository(repositoryRoot, repositoryRoot)).toBe(true);
    expect(
      isPathInsideRepository(repositoryRoot, path.join(repositoryRoot, "docs", "README.md")),
    ).toBe(true);
    expect(
      isPathInsideRepository(repositoryRoot, path.resolve(repositoryRoot, "..", "private.md")),
    ).toBe(false);
    expect(isPathInsideRepository(repositoryRoot, "/tmp/private.md")).toBe(false);
  });

  it("reports traversal and malformed percent encoding as invalid local targets", () => {
    expect(localTarget("docs/README.md", "../../private.md")).toMatchObject({
      kind: "invalid",
      reason: "path escapes repository",
    });
    expect(localTarget("README.md", "%E0%A4%A")).toMatchObject({
      kind: "invalid",
      reason: "malformed percent encoding",
    });
  });

  it("extracts angle-bracket destinations and basic reference links", () => {
    const markdown = [
      "[guide](<docs/getting started.md>)",
      "[security guide][security]",
      "[security]: <docs/security.md> \"Security policy\"",
    ].join("\n");

    expect(markdownTargets(markdown)).toEqual([
      "docs/getting started.md",
      "docs/security.md",
    ]);
  });

  it("extracts every candidate from HTML srcset attributes", () => {
    const html = '<picture><source srcset="small.webp 1x, large.webp 2x"><img src="fallback.webp"></picture>';
    expect(markdownTargets(html)).toEqual([
      "small.webp",
      "large.webp",
      "fallback.webp",
    ]);
  });
});

describe("public documentation contract", () => {
  it("keeps the root README within the launch-page line budget", () => {
    const lines = readFileSync(path.join(repositoryRoot, "README.md"), "utf8")
      .trimEnd()
      .split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(100);
    expect(lines.length).toBeLessThanOrEqual(160);
  });

  it("includes one responsive hero and every required public asset", () => {
    const readme = readFileSync(path.join(repositoryRoot, "README.md"), "utf8");
    expect(readme.match(/<picture>/g)).toHaveLength(1);
    expect(readme.match(/readme-hero\.webp/g)).toHaveLength(1);
    expect(readme.match(/readme-hero-mobile\.webp/g)).toHaveLength(1);
    for (const asset of requiredAssets) {
      expect(existsSync(path.join(repositoryRoot, asset)), asset).toBe(true);
    }
  });

  it("resolves every relative Markdown and documentation HTML link", () => {
    const missing: string[] = [];
    for (const file of documentationFiles) {
      const absoluteFile = path.join(repositoryRoot, file);
      if (!existsSync(absoluteFile)) {
        missing.push(`${file}: missing document`);
        continue;
      }
      for (const target of markdownTargets(readFileSync(absoluteFile, "utf8"))) {
        const resolved = localTarget(file, target);
        if (resolved?.kind === "invalid") {
          missing.push(`${file}: ${target} (${resolved.reason})`);
        } else if (resolved?.kind === "local" && !existsSync(resolved.resolvedPath)) {
          missing.push(`${file}: ${target}`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("keeps private network literals and overlay-network names out of public text", () => {
    const findings: string[] = [];
    for (const file of documentationFiles) {
      const absoluteFile = path.join(repositoryRoot, file);
      if (!existsSync(absoluteFile)) continue;
      const lines = readFileSync(absoluteFile, "utf8").split("\n");
      for (const [index, line] of lines.entries()) {
        for (const pattern of privateAddressPatterns()) {
          if (pattern.test(line)) findings.push(`${file}:${index + 1}: ${pattern.source}`);
        }
      }
    }
    expect(findings, findings.join("\n")).toEqual([]);
  });
});
