# Development

## Prerequisites

- Node.js 20.9 or newer
- npm (the lockfile is authoritative)
- Git
- Docker with the Compose plugin for container contract tests and smoke checks

## Setup

```bash
git clone https://github.com/MiguelMedeiros/mempool-matrix.git
cd mempool-matrix
npm ci --no-audit --no-fund
npm run dev
```

Open <http://localhost:3000>. The default source is the public mempool.space API.
Use environment configuration for a compatible local API; never commit private
infrastructure values.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm test` | Run the Vitest suite once |
| `npm run test:coverage` | Run tests with V8 coverage |
| `npm run lint` | Run ESLint |
| `npm run build` | Create a production Next.js build |
| `npm run audit:security` | Audit production and tooling dependencies with the fail-closed exception policy |
| `npm run start` | Start the production server after a build |
| `docker compose up -d --build` | Build and run the portable container deployment |

Some tests invoke Git or `docker compose config`, so those tools must be
available for the complete suite.

## Test-driven changes

For behavior changes:

1. Add or update a focused test that fails for the intended reason.
2. Run the smallest relevant Vitest target and confirm the failure.
3. Implement the minimum change that makes the test pass.
4. Refactor without changing behavior.
5. Run the complete quality gates.

Before opening a pull request:

```bash
npm test
npm run test:coverage
npm run lint
npm run build
npm run audit:security
git diff --check
```

CI audits production and tooling dependencies, tolerates only the exact documented
upstream exception, and fails closed on advisory or lockfile drift.

Container or packaging changes also require a local build, health check, route
smoke tests, persistence recreation test, and architecture-specific evidence.
Do not claim a registry, architecture, UID, or Umbrel guarantee without executing
the corresponding check.

## Private infrastructure guard

Public source, tests, fixtures, documentation, screenshots, commits, and issue
text must not contain:

- private hostnames, deployment names, or internal network topology;
- non-example access addresses or personal infrastructure URLs;
- API, RPC, bearer, session, or registry credentials;
- SSH keys, seed phrases, wallet data, or `.env` contents; or
- screenshots containing private browser chrome, endpoints, or identifiers.

Use neutral reserved names such as `example.com` and Compose service names in
examples. Keep deployment overrides outside the repository. Run the project's
secret and tracked-text checks when they are available in the branch.

## Source and API changes

Read [Architecture](architecture.md), [Configuration](configuration.md), and
[Security](security.md) before changing data-source behavior. Preserve these
properties unless a reviewed design replaces them:

- runtime file, then environment, then safe-default precedence;
- read-only settings when no administrative token is configured;
- authentication before body parsing or network probes;
- URL validation, checked DNS resolution, pinned connection, and no redirects;
- bounded body sizes, response sizes, timeouts, and rate-limit memory; and
- atomic runtime config writes.

Tests should cover both expected behavior and failure ordering. Security failures
must happen before expensive or state-changing operations.

## Contribution flow

1. Search existing issues before opening a duplicate.
2. Discuss broad features or architectural changes before implementation.
3. Create a focused branch from the current default branch.
4. Keep commits scoped and use clear imperative or Conventional Commit messages.
5. Update tests and public documentation with behavior changes.
6. Run all applicable gates and record real results in the pull request.
7. Open a pull request describing motivation, behavior, security impact, and
   manual verification.
8. Address review without weakening portability, privacy, or security controls.

Do not mix unrelated refactors with fixes. Generated `.next`, coverage output,
local `data`, secrets, and deployment-specific overrides do not belong in a
pull request.
