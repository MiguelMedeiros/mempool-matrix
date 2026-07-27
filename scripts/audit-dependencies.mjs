#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateDependencyAudits, parseAuditJson } from "./dependency-audit.mjs";

// npm currently flags the corrected brace-expansion 1.1.16 backport because the
// upstream range in https://github.com/advisories/GHSA-mh99-v99m-4gvg is <=5.0.7.
// Keep this exception exact and fail closed on any advisory or lockfile drift.
function runAudit(args, label) {
  const result = spawnSync("npm", ["audit", ...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`${label}: npm audit command failed (${result.error.message})`);
  }
  if (result.signal || (result.status !== 0 && result.status !== 1)) {
    throw new Error(
      `${label}: npm audit command failed with ${result.signal ?? `exit ${result.status}`}`,
    );
  }
  if (!result.stdout.trim()) {
    throw new Error(
      `${label}: npm audit returned no parseable JSON${result.stderr ? ` (${result.stderr.trim()})` : ""}`,
    );
  }

  return parseAuditJson(result.stdout, label);
}

function formatCounts(counts) {
  return `info=${counts.info}, low=${counts.low}, moderate=${counts.moderate}, high=${counts.high}, critical=${counts.critical}, total=${counts.total}`;
}

export function main() {
  try {
    const full = runAudit([], "full audit");
    const production = runAudit(["--omit=dev"], "production audit");
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    const evaluation = evaluateDependencyAudits(full, production, lock);

    console.log(`Full audit counts: ${formatCounts(evaluation.fullCounts)}`);
    console.log(
      `Production audit counts: ${formatCounts(evaluation.productionCounts)}`,
    );
    console.log(
      `brace-expansion lock versions: ${evaluation.braceExpansionVersions.join(", ")}`,
    );

    if (!evaluation.ok) {
      for (const error of evaluation.errors) console.error(`AUDIT GATE: ${error}`);
      console.error(
        `${evaluation.actionableHighCritical} actionable high/critical; audit gate failed closed`,
      );
      return 1;
    }

    console.log(
      `${evaluation.actionableHighCritical} actionable high/critical; ${evaluation.allowlistedFalsePositives} allowlisted upstream-range false positive`,
    );
    return 0;
  } catch (error) {
    console.error(`AUDIT GATE: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Audit gate failed closed.");
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
