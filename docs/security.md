# Security

This document describes controls present in the current code and the boundaries
operators must provide. To report a vulnerability, follow [SECURITY.md](../SECURITY.md).

## Threat model

Mempool Matrix processes public Bitcoin transaction data, but two interfaces can
create meaningful risk:

1. users can ask the server to contact a configurable upstream API; and
2. authorized users can persist that destination for future server requests.

The design assumes the application runs behind an operator-controlled network or
reverse proxy. It does not provide user accounts or general application-level
access control. The settings token protects source testing and mutation, not the
main visualization, transaction API, history API, or health endpoint.

The application is not a wallet and does not need seed phrases, private keys,
Bitcoin RPC credentials, or funds. Never provide those secrets to it.

## SSRF controls

Source URLs pass through validation before use:

- HTTP and HTTPS are the only accepted protocols.
- Embedded URL credentials, query strings, and fragments are rejected.
- Paths must end in `/api`; root paths are normalized to `/api`.
- Known cloud metadata names and link-local metadata addresses are blocked.
- `MEMPOOL_SOURCE_DENY_HOSTS` can reject additional exact hostnames.
- DNS resolves before connection; all answers are checked and the request is
  pinned to a checked address.
- Redirects are handled manually and are not followed.
- HTTPS keeps certificate verification and original-host SNI.

RFC1918/private-network destinations are allowed intentionally so an operator can
use a local mempool API. Consequently, an authorized settings user may be able
to make compatibility probes to reachable internal HTTP services. Treat the
settings token as an administrative credential, deny unneeded hosts, and apply
network egress policy when stronger isolation is required.

The validator is a defense in depth measure, not a substitute for container or
host firewall policy.

## Resource limits

- Normal source requests default to 8 seconds; the configured value is capped at
  60 seconds.
- Connection probes use an 8-second outer timeout.
- Source response bodies are limited to 4 MiB and the connection is destroyed
  when the limit is exceeded.
- Settings JSON request bodies are limited to 4 KiB and must use an exact
  `application/json` media type (parameters are accepted when syntactically valid).
- Transaction IDs must be exactly 64 hexadecimal characters.
- History query ranges are enumerated and response limits are clamped.

## Settings authentication

Without `MEMPOOL_SETTINGS_TOKEN`, settings are read-only by default. With a token,
probe and update routes require an exact Bearer value and compare SHA-256 digests
with a timing-safe operation. Authentication happens before body parsing and
network probing.

`MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS=true` bypasses this protection and is
only for trusted local development. The value must be exactly `true`. Never use
it on an exposed deployment.

Source probes and updates share a bounded, process-local limiter: six requests
per 60-second window, after which requests receive `429`. This is not a global
limiter across replicas and resets when the process restarts.

## Reverse proxies

Forwarding headers are ignored by the limiter unless
`MEMPOOL_TRUST_PROXY=true`. Enable proxy trust only when:

- clients cannot bypass the reverse proxy; and
- the proxy overwrites, rather than appends to untrusted, client-supplied
  forwarding headers according to the deployment's policy.

When enabled, the current limiter uses the right-most `X-Forwarded-For` value,
then `X-Real-IP`. A public deployment should also add TLS, access logging policy,
request limits, and any desired authentication at the proxy.

## Credentials and data

- Generate a long random settings token and pass it through a secret manager or
  protected environment, not a committed `.env` file.
- Do not put credentials in source URLs; they are rejected.
- The browser stores an unlocked settings token in memory and `sessionStorage`
  for the active browser session, not `localStorage`.
- The runtime config stores the selected URL and label, not the settings token.
- Runtime config and history paths may reveal internal hostnames or usage
  patterns; protect and back up `/data` appropriately.
- The default source sends data requests to mempool.space. Use a local compatible
  API when that third-party request path is undesirable.

## Container status

No prebuilt image is documented. The source-build Dockerfile uses traced Next.js
standalone output and runs as fixed UID/GID `1000:1000`. Its `/data` mount point
is pre-owned by that identity so a fresh Compose named volume is writable without
runtime initialization or a root chown helper. The application payload is limited
to traced Next.js and public assets, while the pinned Node-on-Alpine base and its
standard Alpine utilities remain. npm, npx, Corepack, and Yarn are unavailable
in the merged runtime filesystem.

Stock Compose drops all Linux capabilities, enables `no-new-privileges`, mounts
the root filesystem read-only, and provides only `/tmp` as a restricted writable
tmpfs in addition to persistent `/data`.

Do not grant the container privileged mode, host networking, the Docker socket,
devices, or broad host mounts. Treat the named volume as sensitive application
data, back it up before upgrades, and do not use `docker compose down --volumes`
unless deletion is intentional. A custom bind mount must be prepared so UID/GID
1000 can write it; the stock Compose contract avoids that host-permission
requirement.

## Reporting

[SECURITY.md](../SECURITY.md) records the current reporting status. A verified
private path will be listed before publication. Do not include credentials,
private infrastructure addresses, or exploit details in a public issue.
