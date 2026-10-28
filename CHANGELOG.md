# Changelog

All notable changes to Mempool Matrix will be documented in this file.

## [1.0.4] - 2026-10-28

### Security

- Upgraded Next.js to 16.4.3 to remediate two critical unauthenticated
  remote-code-execution advisories (SVG image optimization on glibc-based
  Linux, and `use cache` typed-array deserialization) and a high-severity
  Server Actions denial-of-service advisory.
- Upgraded `eslint-config-next` to 16.4.3, which resolves the transitive
  `zod` high-severity denial-of-service advisory in the lint toolchain.
- Upgraded Vitest and `@vitest/coverage-v8` to 4.1.12, fixing the
  `@vitest/mocker` medium-severity advisory that Dependabot's automatic
  security update could not resolve due to a pinned-version conflict.
- Full and production dependency audits are zero.

## [1.0.3] - 2026-10-14

### Security

- Upgraded Next.js to 16.3.8 to remediate the critical `next/og`
  remote-code-execution advisory and the image-optimization SSRF advisory.
- Upgraded Sharp to 0.35.5 (librsvg CVE), pinned `source-map-js` 1.2.2, and
  refreshed transitive `brace-expansion` releases; the production audit is zero.
- Replaced the retired `brace-expansion` audit exception with one exact,
  development-only exception for `braces` (GHSA-vfj7-8cjw-p6xm), which has no
  patched release and is reachable only from the lint toolchain.

## [1.0.2] - 2026-09-09

### Changed

- Replaced pre-release container guidance with verified published-image,
  digest-pinning, source-build, reusable release, and private security-reporting
  workflows.

### Security

- Upgraded Next.js to 16.3.4 and Sharp to 0.35.4 to remediate remote-code-
  execution and image-processing advisories; refreshed Vitest and pinned the
  fixed `js-yaml` release so full and production dependency audits return zero.
- Updated the development-only Browserslist dependency past two high-severity
  denial-of-service and malformed custom-stats advisories; full and production
  dependency audits are clean.
- Upgraded the runtime Alpine OpenSSL libraries during image construction to fix
  `CVE-2026-14456` in both supported architectures.

## [1.0.1] - 2026-08-15

### Security

- Updated `js-yaml` to 4.3.1 to remediate quadratic CPU consumption in
  `!!omap` resolution.
- Updated transitive `brace-expansion` and `nanoid` releases to close denial-of-
  service advisories while keeping full and production dependency audits clean.

## [1.0.0] - 2026-07-27

### Added

- Five responsive visualization modes, transaction search and education views,
  fullscreen and mobile controls, fee telemetry, and historical statistics.
- Configurable mempool.space-compatible upstreams with runtime settings and
  persistent history, configuration, and last-known browser state.
- Polished public documentation, project branding, responsive artwork, metadata,
  and an installable PWA shell.
- A multi-stage, non-root Docker runtime with persistent named-volume support and
  an architecture-aware container smoke-test path.
- CI, dependency auditing, secret scanning, and a SemVer-gated release workflow
  that builds multi-architecture images with an SBOM and provenance.

### Security

- Hardened configurable upstream access with SSRF controls, checked DNS and
  connection pinning, redirect denial, bounded timeouts, and response limits.
- Added fail-closed settings authentication, bounded request bodies, rate limits,
  safe persistence, and consistent error handling for source probes and updates.
