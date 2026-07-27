# Contributing to Mempool Matrix

Thank you for helping improve Mempool Matrix. Contributions should stay focused,
portable, secure, and verifiable.

## Before you begin

- Search existing issues and pull requests.
- Use an issue to discuss broad features, UI redesigns, dependency changes, or
  changes to the security and persistence models.
- Do not disclose vulnerabilities in an issue or pull request. Check
  [SECURITY.md](SECURITY.md) for the current private-reporting status.
- Read [docs/development.md](docs/development.md) for setup and quality gates.

## Development workflow

1. Fork or branch from the current default branch.
2. Install the locked dependencies with `npm ci --no-audit --no-fund`.
3. Add a failing test before changing behavior.
4. Implement the smallest coherent fix or feature.
5. Update documentation when behavior, configuration, or deployment changes.
6. Run the required gates:

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

Docker changes also need a real image build, health check, representative route
smoke tests, and persistence recreation test. Umbrel or multi-architecture claims
require their corresponding official lint and runtime evidence.

## Pull requests

Keep each pull request limited to one purpose. Include:

- the problem and motivation;
- a concise description of the solution;
- tests added or changed;
- exact commands run and their real results;
- security, privacy, persistence, and compatibility impact; and
- screenshots for visible changes, with private information removed.

Use clear commit messages; Conventional Commit style is welcome. Avoid drive-by
formatting, generated files, or unrelated refactors. Maintainers may ask for a
change to be split before review.

## Public repository hygiene

Never commit or paste into project discussions:

- credentials, tokens, private keys, wallet material, or `.env` contents;
- private hostnames, personal service URLs, internal topology, or real private
  deployment addresses;
- local `data`, history files, `.next`, coverage output, or editor state; or
- screenshots containing sensitive endpoints, identifiers, or browser chrome.

Use `example.com`, localhost, or neutral Compose service names in examples.
Deployment-specific configuration belongs outside the repository.

## Code expectations

- Preserve strict TypeScript and existing formatting conventions.
- Prefer small pure functions and explicit input validation.
- Keep server-side network activity bounded and abortable.
- Authenticate before parsing request bodies, probing networks, or changing state.
- Do not weaken URL validation, DNS pinning, redirect policy, response/body limits,
  settings defaults, or atomic writes without a reviewed replacement design.
- Add tests for expected behavior, errors, and operation ordering.
- Keep the UI responsive and keyboard-accessible at desktop and mobile widths.

## License

By submitting a contribution, you agree that it may be distributed under the
project's [MIT License](LICENSE). You certify that you have the right to submit
the work.
