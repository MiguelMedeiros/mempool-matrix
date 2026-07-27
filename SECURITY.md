# Security Policy

## Supported versions

Mempool Matrix has not yet published its first public stable release. Security
fixes are developed against the current default branch. This section will be
updated with a version support table when public releases exist.

## Reporting a vulnerability

Private vulnerability reporting will be enabled and verified before the
repository is published. Until this policy names a verified reporting path, do
not disclose a suspected vulnerability in a public issue, discussion, pull
request, commit, or social post. While the repository remains private, use only
an existing private repository or maintainer channel.

A useful private report includes:

- affected commit or version;
- component and deployment assumptions;
- reproduction steps or a minimal proof of concept;
- expected and observed behavior;
- security impact;
- suggested remediation, if known; and
- whether the issue has been disclosed elsewhere.

Please remove credentials, wallet material, personal data, and unrelated private
infrastructure details. Use synthetic values wherever possible.

## Response process

For reports received through the verified private channel, the maintainer will
attempt to acknowledge a complete report, reproduce and triage it, coordinate a
fix, and agree on disclosure timing. Response and release timelines depend on
severity and maintainer availability; no fixed service-level commitment is
currently offered.

Please allow time for a patch and affected-release review before public
disclosure. Credit will be offered when desired and appropriate.

## Scope

In scope includes the application, its server routes, data-source validation and
fetching, runtime settings, history storage, browser UI, and project-maintained
container or packaging files.

Third-party services, upstream mempool APIs, Bitcoin Core, Umbrel, browsers,
Node.js, and dependencies should normally be reported to their respective
maintainers unless the issue is caused by Mempool Matrix's integration.

Operational concerns caused solely by intentionally unsafe configuration—such as
unauthenticated settings explicitly enabled on an untrusted network—may not be a
product vulnerability, but reports of surprising or undocumented behavior are
still useful and should not include sensitive details in public.

See [docs/security.md](docs/security.md) for the current threat model, controls,
and deployment boundaries.
