# Security Policy

## Supported versions

Security fixes are developed against the current default branch and released on
the supported stable line:

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
| < 1.0 | No |

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/MiguelMedeiros/mempool-matrix/security/advisories/new)
to report a suspected vulnerability. Do not disclose it in a public issue,
discussion, pull request, commit, or social post.

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
