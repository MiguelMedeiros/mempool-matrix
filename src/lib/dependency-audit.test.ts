import { describe, expect, it } from "vitest";
import {
  evaluateDependencyAudits,
  parseAuditJson,
} from "../../scripts/dependency-audit.mjs";

// braces has no patched release (GHSA-vfj7-8cjw-p6xm, range <=3.0.3). It only
// reaches the lint toolchain through eslint-config-next -> fast-glob.
const allowedAdvisory = {
  source: 1240992,
  name: "braces",
  dependency: "braces",
  title: "braces vulnerable to stack-exhaustion denial of service",
  url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  severity: "high",
  range: "<=3.0.3",
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
    braces: {
      name: "braces",
      severity: "high",
      via: [allowedAdvisory],
    },
    micromatch: {
      name: "micromatch",
      severity: "high",
      via: ["braces"],
    },
    "fast-glob": {
      name: "fast-glob",
      severity: "high",
      via: ["micromatch"],
    },
    "@next/eslint-plugin-next": {
      name: "@next/eslint-plugin-next",
      severity: "high",
      via: ["fast-glob"],
    },
    "eslint-config-next": {
      name: "eslint-config-next",
      severity: "high",
      via: ["@next/eslint-plugin-next"],
    },
  },
  { info: 0, low: 0, moderate: 0, high: 5, critical: 0, total: 5 },
);

const allowedLock = {
  packages: {
    "": { name: "fixture" },
    "node_modules/braces": { version: "3.0.3", dev: true },
  },
};

const fixedLock = {
  packages: {
    "": { name: "fixture" },
  },
};

function evaluate(full: unknown, production: unknown = cleanAudit, lock: unknown = allowedLock) {
  return evaluateDependencyAudits(full, production, lock);
}

describe("dependency audit gate", () => {
  it("allows only the current dev-only braces finding without an upstream fix", () => {
    const result = evaluate(currentAllowedAudit);

    expect(result.ok).toBe(true);
    expect(result.actionableHighCritical).toBe(0);
    expect(result.allowlistedFalsePositives).toBe(1);
    expect(result.allowlistedPackageVersions).toEqual(["3.0.3"]);
  });

  it("no longer allows the retired brace-expansion range exception", () => {
    const retired = audit(
      {
        "brace-expansion": {
          name: "brace-expansion",
          severity: "high",
          via: [
            {
              source: 1124334,
              name: "brace-expansion",
              dependency: "brace-expansion",
              url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
              severity: "high",
              range: "<=5.0.7",
            },
          ],
        },
      },
      { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 },
    );

    expect(evaluate(retired)).toMatchObject({ ok: false });
  });

  it("fails when the allowlisted package is installed for production", () => {
    const productionLock = structuredClone(allowedLock) as {
      packages: Record<string, Record<string, unknown>>;
    };
    delete productionLock.packages["node_modules/braces"].dev;

    const result = evaluate(currentAllowedAudit, cleanAudit, productionLock);

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/braces.*development-only/i);
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
    critical.vulnerabilities.braces.severity = "critical";
    (
      critical.vulnerabilities.braces.via[0] as Record<
        string,
        unknown
      >
    ).severity = "critical";
    critical.metadata.vulnerabilities = {
      info: 0,
      low: 0,
      moderate: 0,
      high: 4,
      critical: 1,
      total: 5,
    };

    const result = evaluate(critical);

    expect(result.ok).toBe(false);
    expect(result.actionableHighCritical).toBeGreaterThan(0);
  });

  it("fails when an installed braces version is not allowlisted", () => {
    const vulnerableLock = structuredClone(allowedLock);
    vulnerableLock.packages["node_modules/braces"].version = "3.0.2";

    const result = evaluate(currentAllowedAudit, cleanAudit, vulnerableLock);

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("3.0.2");
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

  it("passes clean audits once braces is no longer installed", () => {
    const result = evaluate(cleanAudit, cleanAudit, fixedLock);

    expect(result).toMatchObject({
      ok: true,
      actionableHighCritical: 0,
      allowlistedPackageVersions: [],
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
    ["different source", "source", 1240993],
    ["missing range", "range", undefined],
    ["different range", "range", "<3.0.4"],
  ])("rejects the allowlisted advisory with %s", (_description, field, value) => {
    const mutated = structuredClone(currentAllowedAudit);
    const advisory = mutated.vulnerabilities.braces.via[0] as Record<
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
    broken.vulnerabilities.micromatch.via = ["missing-finding"];

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
    drifted.metadata.vulnerabilities.total = 6;

    expect(evaluate(drifted).ok).toBe(false);
  });
});
