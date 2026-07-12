# mempool.matrix

A private, live visualization of Bitcoin mempool activity inspired by digital rain. Transaction IDs fall through a responsive canvas; brightness and speed encode fee rate, while a compact HUD shows the state of the mempool backed by our own Bitcoin node.

## Features

- Five live visual modes: Matrix rain, constellation, fee heatmap, block race, and ambient fullscreen
- Cinematic new-block events that cross the scene without interrupting the transaction rain
- Fee-rate-driven color, brightness, speed, and urgency tiers
- End-of-lane lifecycle: deceleration, surface compression, luminous ripple, hexadecimal fragmentation, and delayed respawn
- Continuous rain across mobile viewport changes and new-block events; existing drops keep their position and lifecycle
- Mempool pressure atmosphere and transaction arrival-rate telemetry
- Full transaction inspector with inputs, outputs, RBF, confirmation block, highlights, and local explorer links
- TXID/URL search with mobile paste, live-rain centering, pause/focus beam, confirmed-transaction lookup, and graceful errors
- Rare-event badges for high-value, high-fee, consolidation, and fan-out transactions
- Mobile configuration sheet for visual mode and opt-in Web Audio sonification
- Compact six-metric live HUD with transaction arrival rate
- Installable PWA with cached shell and last-known mempool snapshot
- Responsive canvas and safe-area-aware mobile interface
- Adaptive rendering budget: stable 48-drop mobile pool, reduced mobile DPR, and zero per-glyph glow in the normal mobile rain
- Node-backed data via the local mempool.space stack on `zero`
- Private Tailscale deployment

## Local development

```bash
npm ci
MEMPOOL_API_URL=http://100.67.121.90:3000/api npm run dev
```

Open `http://localhost:3000`.

## Tests and quality gates

```bash
npm test
npm run test:coverage
npm run lint
npm run build
```

## Docker deployment on zero

The Compose service joins `bitcoin-docker_default` and reads from `http://mempool-web/api`, which is backed by the Bitcoin node running on `zero`.

```bash
docker compose up -d --build
```

By default it publishes port `3033` on `zero`; the host's containerized Tailscale endpoint makes it reachable privately at the zero Tailscale address.
