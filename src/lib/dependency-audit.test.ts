import { describe, expect, it } from "vitest";
import {
  evaluateDependencyAudits,
  parseAuditJson,
} from "../../scripts/dependency-audit.mjs";

const allowedAdvisory = {
  source: 1124334,
  name: "brace-expansion",
  dependency: "brace-expansion",
  title: "brace-expansion denial of service",
  url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
  severity: "high",
  range: "<=5.0.7",
};

type SeverityCounts = {
  info: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
  total: number;
};

type AuditEntry = {
  name: string;
  severity: string;
  via: Array<string | Record<string, unknown>>;
};

type AuditFixture = {
  auditReportVersion: number;
  vulnerabilities: Record<string, AuditEntry>;
  metadata: { vulnerabilities: SeverityCounts };
};

function audit(
  vulnerabilities: Record<string, AuditEntry> = {},
  counts: SeverityCounts = {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    total: 0,
  },
): AuditFixture {
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: counts },
  };
}

const cleanAudit = audit();

const currentAllowedAudit = audit(
  {
    "brace-expansion": {
      name: "brace-expansion",
      severity: "high",
      via: [allowedAdvisory],
    },
    minimatch: {
      name: "minimatch",
      severity: "high",
      via: ["brace-expansion"],
    },
    eslint: {
      name: "eslint",
      severity: "high",
      via: ["minimatch"],
    },
  },
  { info: 0, low: 0, moderate: 0, high: 3, critical: 0, total: 3 },
);

const allowedLock = {
  packages: {
    "": { name: "fixture" },
    "node_modules/brace-expansion": { version: "5.0.8" },
    "node_modules/eslint/node_modules/brace-expansion": { version: "1.1.16" },
  },
};

const fixedLock = {
  packages: {
    "": { name: "fixture" },
    "node_modules/brace-expansion": { version: "5.0.9" },
    "node_modules/eslint/node_modules/brace-expansion": { version: "1.1.18" },
  },
};

function evaluate(full: unknown, production: unknown = cleanAudit, lock: unknown = allowedLock) {
  return evaluateDependencyAudits(full, production, lock);
}

describe("dependency audit gate", () => {
  it("allows only the current brace-expansion backport false positive", () => {
    const result = evaluate(currentAllowedAudit);

    expect(result.ok).toBe(true);
    expect(result.actionableHighCritical).toBe(0);
    expect(result.allowlistedFalsePositives).toBe(1);
    expect(result.braceExpansionVersions).toEqual(["1.1.16", "5.0.8"]);
  });

  it("fails for an unrelated high advisory", () => {
    const unrelated = audit(
      {
        dangerous: {
          name: "dangerous",
          severity: "high",
          via: [
            {
              name: "dangerous",
              dependency: "dangerous",
              severity: "high",
              url: "https://github.com/advisories/GHSA-new-advisory",
            },
          ],
        },
      },
      { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 },
    );

    expect(evaluate(unrelated)).toMatchObject({
      ok: false,
      actionableHighCritical: 1,
    });
  });

  it("never allows a critical vulnerability", () => {
    const critical = structuredClone(currentAllowedAudit);
    critical.vulnerabilities["brace-expansion"].severity = "critical";
    (
      critical.vulnerabilities["brace-expansion"].via[0] as Record<
        string,
        unknown
      >
    ).severity = "critical";
    critical.metadata.vulnerabilities = {
      info: 0,
      low: 0,
      moderate: 0,
      high: 2,
      critical: 1,
      total: 3,
    };

    const result = evaluate(critical);

    expect(result.ok).toBe(false);
    expect(result.actionableHighCritical).toBeGreaterThan(0);
  });

  it("fails when any installed brace-expansion version is not allowlisted", () => {
    const vulnerableLock = structuredClone(allowedLock);
    vulnerableLock.packages[
      "node_modules/eslint/node_modules/brace-expansion"
    ].version = "1.1.12";

    const result = evaluate(currentAllowedAudit, cleanAudit, vulnerableLock);

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("1.1.12");
  });

  it("fails closed for malformed audit JSON", () => {
    expect(() => parseAuditJson("not JSON", "full audit")).toThrow(
      /full audit.*JSON/i,
    );
    expect(() => parseAuditJson("{}", "full audit")).toThrow(
      /vulnerabilities/i,
    );
  });

  it("passes clean full and production audits", () => {
    expect(evaluate(cleanAudit)).toMatchObject({
      ok: true,
      actionableHighCritical: 0,
      allowlistedFalsePositives: 0,
    });
  });

  it("passes clean audits with patched brace-expansion versions", () => {
    const result = evaluate(cleanAudit, cleanAudit, fixedLock);

    expect(result).toMatchObject({
      ok: true,
      actionableHighCritical: 0,
      braceExpansionVersions: ["1.1.18", "5.0.9"],
    });
  });

  it("reports moderate findings without failing the high/critical gate", () => {
    const moderate = audit(
      {
        "moderate-package": {
          name: "moderate-package",
          severity: "moderate",
          via: [],
        },
      },
      { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 },
    );

    const result = evaluate(moderate);

    expect(result.ok).toBe(true);
    expect(result.fullCounts.moderate).toBe(1);
  });

  it("fails if production has a high vulnerability", () => {
    const result = evaluate(cleanAudit, currentAllowedAudit);

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/production/i);
  });

  it.each(["low", "moderate"])(
    "fails if production has a %s vulnerability",
    (severity) => {
      const counts = {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 1,
      };
      counts[severity as "low" | "moderate"] = 1;
      const productionFinding = audit(
        {
          "production-package": {
            name: "production-package",
            severity,
            via: [],
          },
        },
        counts,
      );

      const result = evaluate(cleanAudit, productionFinding);

      expect(result.ok).toBe(false);
      expect(result.errors.join(" ")).toMatch(/production audit.*zero vulnerabilities/i);
    },
  );

  it.each([
    ["missing source", "source", undefined],
    ["different source", "source", 1124335],
    ["missing range", "range", undefined],
    ["different range", "range", "<5.0.8"],
  ])("rejects the allowlisted advisory with %s", (_description, field, value) => {
    const mutated = structuredClone(currentAllowedAudit);
    const advisory = mutated.vulnerabilities["brace-expansion"].via[0] as Record<
      string,
      unknown
    >;
    if (value === undefined) delete advisory[field];
    else advisory[field] = value;

    const result = evaluate(mutated);

    expect(result.ok).toBe(false);
    expect(result.actionableHighCritical).toBeGreaterThan(0);
  });

  it("fails when an aggregate string does not resolve to an advisory", () => {
    const broken = structuredClone(currentAllowedAudit);
    broken.vulnerabilities.minimatch.via = ["missing-finding"];

    expect(evaluate(broken).ok).toBe(false);
  });

  it("fails if another advisory object appears beside the allowlisted finding", () => {
    const drifted = structuredClone(currentAllowedAudit);
    drifted.vulnerabilities["moderate-package"] = {
      name: "moderate-package",
      severity: "moderate",
      via: [
        {
          name: "moderate-package",
          dependency: "moderate-package",
          severity: "moderate",
          url: "https://github.com/advisories/GHSA-new-moderate",
        },
      ],
    };
    drifted.metadata.vulnerabilities.moderate = 1;
    drifted.metadata.vulnerabilities.total = 4;

    expect(evaluate(drifted).ok).toBe(false);
  });
});
