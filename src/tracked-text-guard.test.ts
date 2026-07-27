import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { grepTrackedText } from "./lib/tracked-text-guard";

function write(root: string, file: string, content: string | Buffer): void {
  const destination = path.join(root, file);
  const directory = path.dirname(destination);
  mkdirSync(directory, { recursive: true });
  writeFileSync(destination, content);
}

describe("tracked text guard", () => {
  it("searches every tracked text format while excluding binary and ignored files", () => {
    const root = mkdtempSync(path.join(tmpdir(), "tracked-text-guard-"));
    const forbidden = ["private", "host"].join("-");
    execFileSync("git", ["init", "--quiet"], { cwd: root });

    write(root, "styles.css", `/* ${forbidden} */`);
    write(root, "image.svg", `<svg><title>${forbidden}</title></svg>`);
    write(root, "manifest.webmanifest", JSON.stringify({ source: forbidden }));
    write(root, ".dockerignore", `# ${forbidden}`);
    write(root, ".gitignore", `.hermes/\n# ${forbidden}\n`);
    write(root, "binary.dat", Buffer.concat([Buffer.from([0]), Buffer.from(forbidden)]));
    write(root, ".hermes/plans/private.md", forbidden);
    execFileSync("git", ["add", "styles.css", "image.svg", "manifest.webmanifest", ".dockerignore", ".gitignore", "binary.dat"], { cwd: root });

    const findings = grepTrackedText(root, [forbidden]);

    expect(findings.map((finding) => finding.file).sort()).toEqual([
      ".dockerignore",
      ".gitignore",
      "image.svg",
      "manifest.webmanifest",
      "styles.css",
    ]);
    expect(findings.every((finding) => finding.text.includes(forbidden))).toBe(true);
  });
});
