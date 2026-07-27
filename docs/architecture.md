# Architecture

Mempool Matrix is a single Next.js application with a browser-rendered canvas,
server-side API adapters, and filesystem-backed runtime state.

## Components

- **Next.js App Router:** serves the visualization, `/stats`, transaction pages,
  redirect routes, and JSON APIs.
- **React client UI:** `MempoolMatrix` owns the live canvas, controls, polling,
  search, source settings, and browser-side PWA behavior.
- **Canvas renderer:** draws transaction rain and alternate visual modes without
  placing one DOM node per glyph. Fee rate and lifecycle state drive the visual
  encoding.
- **Server API adapter:** fetches and normalizes a mempool.space-compatible API
  so the browser does not connect to a configured source directly.
- **Runtime configuration:** selects a source from a persisted file, environment,
  or safe public default.
- **History collector and store:** samples normalized snapshots into daily JSONL
  files and serves bounded, downsampled time ranges.

## Request routes

| Route | Role |
| --- | --- |
| `GET /api/health` | Process-level health response used by the container healthcheck |
| `GET /api/mempool` | Current normalized mempool, fee, and block snapshot |
| `GET /api/tx/:txid` | Normalized transaction details for a validated 64-character txid |
| `GET /api/mempool/history` | Stored historical points for a bounded range and limit |
| `GET /api/settings/data-source` | Redacted active-source and settings-access status |
| `POST /api/settings/data-source/test` | Authenticated, rate-limited compatibility probe |
| `PUT /api/settings/data-source` | Authenticated probe followed by atomic source persistence |
| `GET /explorer/tx/:txid` | Redirect to the configured public explorer base |

Dynamic data responses use `Cache-Control: no-store`.

## Data flow

```text
Browser canvas and pages
        |
        | same-origin JSON requests
        v
Next.js route handlers
        |
        | resolve runtime file > environment > safe default
        v
URL validation -> DNS lookup -> address checks -> pinned connection
        |
        | HTTP(S), redirects disabled, bounded timeout and response size
        v
mempool.space-compatible REST API
        |
        v
normalization -> browser response / history JSONL
```

The live snapshot adapter requests recent transactions, aggregate mempool
statistics, recommended fees, and recent blocks concurrently. Transaction detail
loads the transaction plus optional outspends and raw hex. Required-response
failures abort sibling work; optional transaction fields degrade gracefully.

## Safe server fetching

Configured sources are server-side destinations, so they cross an SSRF boundary.
The source fetcher resolves DNS itself, checks every returned address for blocked
metadata or link-local destinations, then connects to the first checked address
while preserving the original HTTP Host header and HTTPS SNI. This pins the
connection and avoids a second resolver decision between validation and use.

Only HTTP(S) is supported. Redirect handling is manual, HTTPS certificate
validation remains enabled, source responses are limited to 4 MiB, and normal
source requests default to an 8-second timeout.

Private-network destinations are intentionally supported for local node APIs.
Operators can add exact forbidden hostnames with `MEMPOOL_SOURCE_DENY_HOSTS`.
See [Security](security.md) for the deployment boundary.

## Runtime configuration

`getActiveMempoolSource` reads the configured JSON path and validates its schema
and URL. A valid runtime file wins over `MEMPOOL_API_URL`; invalid bootstrap data
cannot replace the safe `https://mempool.space/api` fallback.

Source updates are not in-place writes. The server creates the parent directory,
writes a uniquely named temporary file with mode `0600`, and renames it over the
configured path. Successful updates clear related in-process runtime state. Only
successfully parsed and validated files are cached, keyed by path, modification
time, and size; invalid files are checked again on the next operation.

The runtime source affects the live snapshot, transaction API, transaction pages,
source status, probes, and history collector on subsequent requests or cycles.

## History

Node instrumentation starts one process-global collector unless
`MEMPOOL_HISTORY_ENABLED=false`. It samples once at startup and then on a bounded
interval. A guard prevents overlapping cycles.

Each point contains transaction count, virtual size, total fees, recommended fee
tiers, and latest-block telemetry. Points are appended to UTC daily `.jsonl`
files. Retention pruning removes old daily files; API reads ignore malformed
lines, sort by timestamp, filter the selected window, and downsample to the
requested limit.

This storage model is designed for a single application process and a local
filesystem. Multiple replicas would each start a collector and should not share
the same writable files without external coordination.

## Deployment shape

The current portable deployment is one application container plus one writable
`/data` mount. The included Compose file builds from source, publishes container
port `3000` on host port `3033`, and does not require a private Docker network.
No public prebuilt image is documented yet.
