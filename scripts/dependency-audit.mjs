const ALLOWED_ADVISORY_URL =
  "https://github.com/advisories/GHSA-mh99-v99m-4gvg";
const ALLOWED_ADVISORY_SOURCE = 1124334;
const ALLOWED_ADVISORY_RANGE = "<=5.0.7";
const ALLOWED_PACKAGE = "brace-expansion";
const ALLOWED_BRACE_EXPANSION_VERSIONS = new Set([
  "1.1.16",
  "1.1.18",
  "2.1.2",
  "5.0.8",
  "5.0.9",
]);
const SEVERITIES = ["info", "low", "moderate", "high", "critical"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateAudit(value, label) {
  if (!isRecord(value) || !isRecord(value.vulnerabilities)) {
    throw new Error(`${label}: missing vulnerabilities object`);
  }
  if (
    !isRecord(value.metadata) ||
    !isRecord(value.metadata.vulnerabilities)
  ) {
    throw new Error(`${label}: missing metadata.vulnerabilities counts`);
  }

  const counts = value.metadata.vulnerabilities;
  for (const severity of [...SEVERITIES, "total"]) {
    if (!Number.isInteger(counts[severity]) || counts[severity] < 0) {
      throw new Error(`${label}: invalid ${severity} vulnerability count`);
    }
  }

  const calculated = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const [key, vulnerability] of Object.entries(value.vulnerabilities)) {
    if (
      !isRecord(vulnerability) ||
      vulnerability.name !== key ||
      !SEVERITIES.includes(vulnerability.severity) ||
      !Array.isArray(vulnerability.via)
    ) {
      throw new Error(`${label}: malformed vulnerability entry ${key}`);
    }
    calculated[vulnerability.severity] += 1;
  }

  for (const severity of SEVERITIES) {
    if (calculated[severity] !== counts[severity]) {
      throw new Error(
        `${label}: ${severity} count does not match vulnerability entries`,
      );
    }
  }
  if (
    counts.total !==
    SEVERITIES.reduce((total, severity) => total + counts[severity], 0)
  ) {
    throw new Error(`${label}: total count does not match severity counts`);
  }

  return value;
}

export function parseAuditJson(text, label = "npm audit") {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}: invalid JSON (${error.message})`);
  }
  if (isRecord(parsed) && parsed.error) {
    throw new Error(`${label}: npm audit returned an error`);
  }
  return validateAudit(parsed, label);
}

function readBraceExpansionVersions(lock) {
  if (!isRecord(lock) || !isRecord(lock.packages)) {
    throw new Error("package-lock.json: missing packages object");
  }

  const versions = [];
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (
      /(^|\/)node_modules\/brace-expansion$/.test(path) &&
      isRecord(entry)
    ) {
      if (typeof entry.version !== "string") {
        throw new Error(`package-lock.json: missing version for ${path}`);
      }
      versions.push(entry.version);
    }
  }
  if (versions.length === 0) {
    throw new Error("package-lock.json: no brace-expansion installation found");
  }
  return [...new Set(versions)].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
}

function countActionableProduction(report) {
  return Object.values(report.vulnerabilities).filter(
    (vulnerability) =>
      vulnerability.severity === "high" ||
      vulnerability.severity === "critical",
  ).length;
}

function isAllowedAdvisory(key, via) {
  return (
    key === ALLOWED_PACKAGE &&
    via.source === ALLOWED_ADVISORY_SOURCE &&
    via.name === ALLOWED_PACKAGE &&
    via.dependency === ALLOWED_PACKAGE &&
    via.url === ALLOWED_ADVISORY_URL &&
    via.severity === "high" &&
    via.range === ALLOWED_ADVISORY_RANGE
  );
}

function inspectFullHighFindings(report) {
  const errors = [];
  const allowedAdvisories = new Set();
  let advisoryObjectCount = 0;
  let actionable = 0;
  const enforceAllowlist =
    report.metadata.vulnerabilities.high > 0 ||
    report.metadata.vulnerabilities.critical > 0;

  for (const [key, vulnerability] of Object.entries(report.vulnerabilities)) {
    for (const via of vulnerability.via) {
      if (!isRecord(via) || !enforceAllowlist) continue;
      advisoryObjectCount += 1;
      const isAllowed = isAllowedAdvisory(key, via);
      if (isAllowed) {
        allowedAdvisories.add(`${via.source ?? "unknown"}:${via.url}`);
      } else {
        errors.push(
          `full audit: advisory in ${key} is not the exact allowlisted finding`,
        );
      }
    }
  }

  const trace = (key, stack = new Set()) => {
    if (stack.has(key)) {
      errors.push(`full audit: cyclic aggregate path through ${key}`);
      return false;
    }
    const vulnerability = report.vulnerabilities[key];
    if (!vulnerability) {
      errors.push(`full audit: aggregate references missing finding ${key}`);
      return false;
    }

    const nextStack = new Set(stack).add(key);
    let reachedAllowedAdvisory = false;
    for (const via of vulnerability.via) {
      if (typeof via === "string") {
        reachedAllowedAdvisory = trace(via, nextStack) || reachedAllowedAdvisory;
        continue;
      }
      if (!isRecord(via)) {
        errors.push(`full audit: malformed advisory in ${key}`);
        continue;
      }
      const isAllowed = isAllowedAdvisory(key, via);
      if (!isAllowed) {
        continue;
      }
      reachedAllowedAdvisory = true;
    }
    if (!reachedAllowedAdvisory) {
      errors.push(`full audit: ${key} does not resolve to an allowed advisory`);
    }
    return reachedAllowedAdvisory;
  };

  for (const [key, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (vulnerability.severity === "critical") {
      actionable += 1;
      errors.push(`full audit: critical finding ${key} is never allowlisted`);
    } else if (vulnerability.severity === "high") {
      const errorCount = errors.length;
      if (!trace(key) || errors.length > errorCount) actionable += 1;
    }
  }

  return { actionable, advisoryObjectCount, allowedAdvisories, errors };
}

export function evaluateDependencyAudits(fullValue, productionValue, lock) {
  const full = validateAudit(fullValue, "full audit");
  const production = validateAudit(productionValue, "production audit");
  const braceExpansionVersions = readBraceExpansionVersions(lock);
  const errors = [];

  const productionActionable = countActionableProduction(production);
  if (
    production.metadata.vulnerabilities.total !== 0 ||
    Object.keys(production.vulnerabilities).length !== 0
  ) {
    errors.push(
      "production audit: expected literal zero vulnerabilities",
    );
  }

  const fullInspection = inspectFullHighFindings(full);
  errors.push(...fullInspection.errors);

  const disallowedVersions = braceExpansionVersions.filter(
    (version) => !ALLOWED_BRACE_EXPANSION_VERSIONS.has(version),
  );
  if (disallowedVersions.length > 0) {
    errors.push(
      `package-lock.json: non-allowlisted brace-expansion version(s): ${disallowedVersions.join(", ")}`,
    );
  }

  const hasFullHigh = full.metadata.vulnerabilities.high > 0;
  if (
    hasFullHigh &&
    (fullInspection.allowedAdvisories.size !== 1 ||
      fullInspection.advisoryObjectCount !== 1)
  ) {
    errors.push(
      `full audit: expected exactly one allowlisted upstream advisory object, found ${fullInspection.advisoryObjectCount}`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    actionableHighCritical:
      productionActionable + fullInspection.actionable,
    allowlistedFalsePositives:
      hasFullHigh &&
      fullInspection.actionable === 0 &&
      fullInspection.allowedAdvisories.size === 1
        ? 1
        : 0,
    braceExpansionVersions,
    fullCounts: { ...full.metadata.vulnerabilities },
    productionCounts: { ...production.metadata.vulnerabilities },
  };
}
