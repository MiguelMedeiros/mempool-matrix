# Docker

The repository currently includes a source-build Dockerfile and Compose file.
The current runtime stage has no `USER` instruction, so it runs as root. There is
no documented prebuilt image; build the checkout locally instead of using an
unverified registry reference.

## Current Compose workflow

```bash
git clone https://github.com/MiguelMedeiros/mempool-matrix.git
cd mempool-matrix
docker compose up -d --build
```

Open <http://localhost:3033>. The current Compose service:

- builds the image from the local checkout;
- runs Next.js on container port `3000`;
- publishes `${PORT:-3033}` on the host;
- defaults to `https://mempool.space/api`;
- mounts `./data` at `/data`;
- uses `restart: unless-stopped`; and
- applies a 512 MiB Compose memory limit.

No pre-existing Docker network or local mempool service is required.

## Configuration

Copy `.env.example` to `.env` and adjust values before startup. At minimum,
generate a settings token if source changes should be available:

```bash
cp .env.example .env
openssl rand -hex 32
# Put the generated value in MEMPOOL_SETTINGS_TOKEN in .env.
docker compose up -d --build
```

Do not commit `.env`. See [Configuration](configuration.md) for every variable
and the source precedence model.

`NEXT_PUBLIC_SITE_URL` is optional and is consumed while the image is built. Set
it to the deployment's publicly routable, root-only HTTP(S) origin (without
credentials, query, or fragment) to emit Open Graph and Twitter image URLs, then
rebuild the image. Localhost, single-label/local hostnames, and non-public IP
literals are rejected. Private or local deployments should omit the variable
rather than set it to an internal URL. Leave it empty for a generic self-hosted
image; social image metadata is intentionally omitted rather than pointing
crawlers at localhost or another deployment. Changing it only in a running
container does not update the statically built metadata.

## Persistence

Compose bind-mounts `./data:/data`. The current container writes:

- `/data/runtime-config.json` for a runtime-selected API; and
- `/data/mempool-history/*.jsonl` for daily history.

Back up `./data` before upgrades. To verify persistence, save a source setting,
allow at least one history sample, recreate the service, and confirm both the
source status and `/stats` data remain available:

```bash
docker compose up -d --build --force-recreate
```

Filesystem permissions must allow the container process to write the mount. The
current Dockerfile runs as root, but `/data` write access must still be verified
before relying on persistence. Re-check permissions and ownership when the
runtime user changes.

## Health and logs

The image includes a Docker healthcheck against the process-level endpoint:

```bash
curl --fail http://localhost:3033/api/health
docker compose ps
docker compose logs --no-log-prefix mempool-matrix
```

`/api/health` currently reports that the Next.js process can answer requests. It
does not probe the configured mempool source. Source availability appears in the
settings status and normal API behavior.

## Use a compatible local API

Set a URL reachable from the container and ending in `/api`:

```bash
MEMPOOL_API_URL=http://mempool-api:8080/api docker compose up -d --build
```

A service hostname such as `mempool-api` requires both services to share a
Docker network. The stock Compose file defines only Mempool Matrix, so add the
upstream service/network in an override rather than hard-coding a private
deployment into the project file.

## Upgrade and rollback

The current workflow builds mutable local source, so record the Git commit before
upgrading:

```bash
git rev-parse HEAD
git pull --ff-only
docker compose build --pull
docker compose up -d
```

If the new build fails, check out the recorded commit, rebuild, and recreate the
service while retaining `./data`. Review configuration schema and release notes
before downgrading across versions.

## Image status

No prebuilt image is documented. This guide supports local builds with
`docker compose up --build`. The current source-built image runs as root. Do not
infer an architecture matrix, SBOM, provenance, or vulnerability-scanning
guarantee from that workflow.

Registry, version, digest, and architecture examples belong here only after the
referenced artifact is publicly pullable and has been verified.
