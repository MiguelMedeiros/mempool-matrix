# Changelog

All notable changes to Mempool Matrix will be documented in this file.

## Unreleased

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
