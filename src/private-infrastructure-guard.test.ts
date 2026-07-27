import path from "node:path";
import { describe, expect, it } from "vitest";
import { grepTrackedText } from "./lib/tracked-text-guard";

const forbiddenPatterns = [
  ["100", "67", "121", "90"].join("."),
  ["100", "81", "12", "32"].join("."),
  ["tail", "cf248"].join(""),
  ["zero", "tail"].join("."),
];
const repositoryRoot = path.resolve(import.meta.dirname, "..");

describe("private infrastructure regression guard", () => {
  it("keeps known personal deployment identifiers out of all tracked text files", () => {
    const findings = grepTrackedText(repositoryRoot, forbiddenPatterns);
    const report = findings
      .map(({ file, line, text }) => `${file}:${line}: ${text}`)
      .join("\n");

    expect(findings, report).toEqual([]);
  });
});
