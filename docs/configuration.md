# Configuration

Mempool Matrix can use the public mempool.space API or another
mempool.space-compatible REST API. Raw Bitcoin Core RPC is not supported.

## Source precedence

The active source is resolved on each server-side operation in this order:

1. A valid JSON file at `MEMPOOL_CONFIG_PATH`
2. A valid `MEMPOOL_API_URL`
3. The safe default, `https://mempool.space/api`

An absent, malformed, or invalid runtime file is ignored. An invalid environment
URL also falls back to the safe default. Only successfully parsed and validated
runtime files are cached, keyed by path, modification time, and size. Invalid
files are checked again on the next operation. Updates made through the settings
API are written to a temporary file with mode `0600` and atomically renamed into
place.

## Environment reference

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | unset | Optional publicly routable site origin used **at build time** for Open Graph and Twitter image URLs. Must be an absolute root-only HTTP(S) origin without credentials, query, or fragment; localhost, single-label/local names, and non-public IP literals are rejected. When unset, URL-dependent social metadata is omitted so generic self-hosted builds never advertise localhost or a wrong canonical origin. Private/local deployments should omit this variable rather than set it to an internal URL. |
| `MEMPOOL_API_URL` | `https://mempool.space/api` | Bootstrap mempool.space-compatible API URL. A runtime file takes precedence. |
| `MEMPOOL_CONFIG_PATH` | `/data/runtime-config.json` | Runtime source configuration file. Its parent directory must be writable to save settings. |
| `MEMPOOL_SETTINGS_TOKEN` | unset; empty in Compose | Token required for source tests and updates. If unset or empty, settings are read-only unless the development opt-in is enabled. |
| `MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS` | unset / `false` in Compose | Exact value `true` enables unauthenticated source tests and updates. Trusted local development only. |
| `MEMPOOL_TRUST_PROXY` | unset / `false` in Compose | Exact value `true` allows the settings probe limiter to use forwarding headers. Enable only behind a trusted proxy that overwrites them. |
| `MEMPOOL_SOURCE_DENY_HOSTS` | unset | Comma-separated exact hostnames to reject as data sources, in addition to built-in metadata and link-local protections. |
| `MEMPOOL_REQUEST_TIMEOUT_MS` | `8000` | Timeout for source requests in milliseconds. Positive values are capped at `60000`; invalid values use `8000`. |
| `MEMPOOL_HISTORY_ENABLED` | enabled | Exact value `false` disables the background history collector. |
| `MEMPOOL_HISTORY_DIR` | `/tmp/mempool-matrix-history` in code; `/data/mempool-history` in Compose | Directory for daily JSONL history files. |
| `MEMPOOL_HISTORY_INTERVAL_MS` | `60000` | Collection interval, clamped to `15000`–`3600000` milliseconds. |
| `MEMPOOL_HISTORY_RETENTION_DAYS` | `30` | Retention, clamped to `1`–`365` days. |
| `EXPLORER_PUBLIC_URL` | `https://mempool.space` | Base URL used by `/explorer/tx/:txid` redirects. Invalid or non-HTTP(S) values fall back to the default. |
| `PORT` | `3033` in Compose interpolation | Host port published by `docker-compose.yml`; this is not the Next.js container port, which remains `3000`. |

Standard Next.js variables such as `NODE_ENV` are outside this project-specific
reference.

## Settings access model

`GET /api/settings/data-source` is public and returns redacted status. Editable
configuration is included only when the request is authorized.

Source probing and mutation use:

- `POST /api/settings/data-source/test`
- `PUT /api/settings/data-source`

When `MEMPOOL_SETTINGS_TOKEN` is set, clients send it through the `Authorization`
header using the standard Bearer authentication scheme. The token comparison is
timing-safe. When no token is set, both routes return read-only errors unless
`MEMPOOL_ALLOW_UNAUTHENTICATED_SETTINGS=true` is explicitly configured.

The browser keeps an unlocked token in memory and `sessionStorage` for the
current browser session; it is not persisted to `localStorage` by the current UI.
Use a long, random value and avoid placing it in URLs or command history.

## Source URL rules

A source URL:

- must be an absolute `http://` or `https://` URL;
- must not contain embedded credentials, a query string, or a fragment;
- must be no longer than 2,048 characters;
- is normalized to end in `/api` (a root path receives `/api` automatically);
- may have an optional label of 1–64 characters without control characters.

Cloud metadata names and link-local metadata addresses are always rejected.
`MEMPOOL_SOURCE_DENY_HOSTS` adds exact normalized hostnames to that denylist.
Private-network APIs remain usable by design for self-hosted deployments; add
specific internal names to the denylist when they must never be selected.

All source requests are made by the server. DNS is resolved before connection,
all resolved addresses are checked against the built-in blocklist, and the
connection is pinned to the checked address. Redirects are not followed.

## Local API examples

For development on the host, configure a name that resolves from the app:

```bash
MEMPOOL_API_URL=http://localhost:8080/api npm run dev
```

For Docker, use a resolvable Compose service name or an explicitly configured
host gateway:

```yaml
services:
  mempool-matrix:
    environment:
      MEMPOOL_API_URL: http://mempool-api:8080/api
```

The endpoint must implement the mempool.space REST routes used by the app,
including recent mempool transactions, mempool statistics, recommended fees,
blocks, and transaction details.

## Runtime file format

The settings API writes version 1 JSON:

```json
{
  "version": 1,
  "type": "mempool-api",
  "baseUrl": "https://mempool.space/api",
  "label": "Public source",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

Do not edit the file while the application is writing it. To return to the
environment/default source, stop the application, remove the runtime file, and
start it again.

## History

The collector starts with the Node.js server, samples immediately, then runs on
the configured interval. It stores one JSON object per line in daily UTC files
and prunes files outside retention. Collection cycles never overlap.

The history API supports ranges `1h`, `6h`, `24h`, `7d`, and `30d`:

```text
/api/mempool/history?range=24h&limit=480
```

The limit is clamped to 30–1,000 points and older data is downsampled for the
response. Persist `MEMPOOL_HISTORY_DIR` if history must survive recreation.
