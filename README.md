# mempool.matrix

A live visualization of Bitcoin mempool activity inspired by digital rain. Transaction IDs fall through a responsive canvas; brightness and speed encode fee rate, while a compact HUD shows the state of the configured mempool.space-compatible source.

## Features

- Five live visual modes: Matrix rain, constellation, fee heatmap, block race, and ambient fullscreen
- Cinematic new-block events that cross the scene without interrupting the transaction rain
- Fee-rate-driven color, brightness, speed, and urgency tiers
- End-of-lane lifecycle: deceleration, surface compression, luminous ripple, hexadecimal fragmentation, and delayed respawn
- Continuous rain across mobile viewport changes and new-block events; existing drops keep their position and lifecycle
- Mempool pressure atmosphere and transaction arrival-rate telemetry
- Full educational transaction explorer with inputs, outputs, scripts, witness stacks, outspends, raw hex, RBF, confirmation data, and field tooltips
- TXID/URL search with mobile paste, live-rain centering, pause/focus beam, confirmed-transaction lookup, and graceful errors
- Rare-event badges for high-value, high-fee, consolidation, and fan-out transactions
- Mobile configuration sheet for visual mode, opt-in Web Audio sonification, and runtime data-source selection
- Compact six-metric live HUD with transaction arrival rate
- Persistent 30-day backend history for transaction count, virtual size, fee estimates, and block telemetry
- Inline one-hour sparklines plus a responsive `/stats` dashboard with selectable time ranges
- Installable PWA with cached shell and last-known mempool snapshot
- Responsive canvas and safe-area-aware mobile interface
- Adaptive rendering budget: stable 48-drop mobile pool, reduced mobile DPR, and zero per-glyph glow in the normal mobile rain
- Matrix easter eggs tied to real activity: White Rabbit, Wake Up Satoshi, Red/Blue Pill, Kung Fu priority, RBF Déjà Vu, Spoon bending, Knock Knock blocks, fee Agents, hidden names, and Zion mode
- Public mempool.space data by default, with support for compatible local nodes
- Portable Docker Compose deployment

## Local development

Node.js and npm are required for local development.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

The source defaults to `https://mempool.space/api` when `MEMPOOL_API_URL` is
unset. The settings sheet accepts any compatible HTTP(S) endpoint whose path
ends in `/api`.

## Tests and quality gates

The full test suite also requires Git and Docker Compose. These contribution and
testing notes are provisional; the final contributor documentation will arrive
in Task 7.

```bash
npm test
npm run test:coverage
npm run lint
npm run build
```

## Docker deployment

The included Compose configuration uses `https://mempool.space/api` by default,
so it does not require a pre-existing Docker network or local mempool service.

```bash
docker compose up -d --build
```

By default it publishes port `3033`; open `http://localhost:3033`.
To use a compatible local API instead, override the source when starting it:

```bash
MEMPOOL_API_URL=http://192.168.1.10:8080/api docker compose up -d --build
```

The endpoint must be reachable from the container and its path must end in
`/api`.

### Runtime data-source settings

The settings sheet can test and save a mempool.space-compatible REST API
without restarting the app. A saved source takes effect on the live mempool,
transaction pages, transaction API, and history collector on their next
request. Configuration precedence is:

1. Runtime file (`MEMPOOL_CONFIG_PATH`, default `/data/runtime-config.json`)
2. `MEMPOOL_API_URL`
3. `https://mempool.space/api`

The runtime file is written atomically inside the existing `./data` volume.
URLs cannot contain credentials, redirects are not followed, and connection
tests time out after eight seconds. Raw Bitcoin Core RPC endpoints are not
supported in this version.

The connection-test rate limiter is bounded and process-local. Forwarding
headers are ignored unless `MEMPOOL_TRUST_PROXY=true` is explicitly set behind
a trusted reverse proxy; multi-instance deployments need an external shared
limiter if a global limit is required.

When the app is reachable beyond a trusted network, set an administrative
bearer token before starting Compose:

```bash
MEMPOOL_SETTINGS_TOKEN="$(openssl rand -hex 32)" docker compose up -d --build
```

The token protects connection tests and configuration updates. The browser
keeps an entered token in `sessionStorage` only; the public settings status is
redacted to a label, host, and `/api` path.

Historical metrics are sampled every 60 seconds and stored as daily JSONL files in the
`./data` bind mount. The default retention is 30 days. Both values can be adjusted before
starting Compose:

```bash
MEMPOOL_HISTORY_INTERVAL_MS=60000 \
MEMPOOL_HISTORY_RETENTION_DAYS=30 \
docker compose up -d --build
```

The history API is available at `/api/mempool/history?range=24h&limit=480`. Supported
ranges are `1h`, `6h`, `24h`, `7d`, and `30d`.
