# mempool.matrix

A private, live visualization of Bitcoin mempool activity inspired by digital rain. Transaction IDs fall through a responsive canvas; brightness and speed encode fee rate, while a compact HUD shows the state of the mempool backed by our own Bitcoin node.

## Features

- Live transaction polling through a server-side Next.js route
- Node-backed data via a local mempool.space stack
- Responsive canvas optimized for desktop and mobile
- Tap/click transaction inspection
- Fee-rate-driven motion and luminance
- Pause/resume controls
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
