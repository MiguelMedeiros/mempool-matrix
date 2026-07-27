# Docker

The repository includes a reproducible, source-build Dockerfile and Compose file.
The final image uses Next.js standalone output and runs as UID/GID `1000:1000`.
Its application payload is limited to the traced server, static assets, and
public assets. The pinned Node-on-Alpine base and its standard Alpine utilities
remain; npm, npx, Corepack, and Yarn are unavailable in the merged runtime
filesystem. There is no documented prebuilt
image; build the checkout locally instead of using an unverified registry
reference.

## Compose workflow

```bash
git clone https://github.com/MiguelMedeiros/mempool-matrix.git
cd mempool-matrix
docker compose up -d --build
```

Open <http://localhost:3033>. The Compose service:

- builds the image locally by default, with `MEMPOOL_MATRIX_IMAGE` available as an image-name override;
- bakes the optional `NEXT_PUBLIC_SITE_URL` build argument into static metadata;
- runs Next.js on container port `3000` as UID/GID `1000:1000`;
- publishes `${PORT:-3033}` on the host;
- defaults to `https://mempool.space/api`;
- stores `/data` in the `mempool-matrix-data` named volume;
- enables a minimal init process and `restart: unless-stopped`;
- drops all Linux capabilities, prevents privilege escalation, and makes the
  root filesystem read-only with a restricted `/tmp` tmpfs;
- checks `/api/health`; and
- applies a 512 MiB Compose memory limit.

A fresh named volume inherits the image's pre-created, UID/GID 1000-owned `/data`
directory, so the application can write immediately without a root chown helper.
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
literals are rejected. Private or local deployments should omit the variable.
An empty value produces a generic self-hosted image without URL-dependent social
metadata. Changing it only in a running container does not update built assets.

## Persistence

The named volume stores:

- `/data/runtime-config.json` for a runtime-selected API; and
- `/data/mempool-history/*.jsonl` for daily history.

The volume survives `docker compose down` and container recreation. Do not use
`docker compose down --volumes` unless permanent data deletion is intended.
Verify persistence by saving a source setting, allowing at least one history
sample, and recreating the service:

```bash
docker compose up -d --build --force-recreate
```

### Backup

Stop writes, create the archive through the Compose service, and restart only
after the archive succeeds:

```bash
umask 077
backup="mempool-matrix-data-$(date +%Y%m%d-%H%M%S).tgz"
docker compose stop mempool-matrix
if docker compose run --rm -T --no-deps --entrypoint sh mempool-matrix \
  -c 'tar -C /data -czf - .' > "$backup"; then
  docker compose start mempool-matrix
else
  status=$?
  rm -f "$backup"
  docker compose start mempool-matrix
  exit "$status"
fi
```

Test the archive before relying on it:

```bash
tar -tzf mempool-matrix-data-YYYYMMDD-HHMMSS.tgz >/dev/null
```

Store backups with restrictive permissions because runtime configuration can
contain internal hostnames.

### Restore

Restoring replaces the named volume's current contents. Stop the service, back
up the current volume first, and inspect the trusted archive for unexpected
absolute or parent-traversal paths before running:

```bash
docker compose stop mempool-matrix
tar -tzf mempool-matrix-data-YYYYMMDD-HHMMSS.tgz
docker compose run --rm -T --no-deps --entrypoint sh mempool-matrix \
  -c 'rm -rf /data/* /data/.[!.]* /data/..?*; tar -xzf - -C /data' \
  < mempool-matrix-data-YYYYMMDD-HHMMSS.tgz
docker compose start mempool-matrix
```

Then check `docker compose ps`, `/api/health`, the selected source, and `/stats`.

### Migrate an existing `./data` bind mount

Keep the old directory untouched until the named-volume deployment is verified.
The previous root-running container may have created `runtime-config.json` with
mode `0600`, so do not archive the source as an unprivileged host user or stream
it directly into a destination that is being cleared.

From the repository root, stop writes, confirm `./data` is the intended source,
and create a restrictive archive through a root helper with a read-only source
mount. The helper uses the locally built application image; it cannot modify the
old directory:

```bash
umask 077
archive="$PWD/mempool-matrix-bind-migration.tgz"
docker compose stop mempool-matrix
rm -f "$archive"
if docker run --rm --user 0:0 --entrypoint tar \
  -v "$PWD/data:/source:ro" \
  "${MEMPOOL_MATRIX_IMAGE:-mempool-matrix:local}" \
  -C /source -czf - . > "$archive" \
  && tar -tzf "$archive" >/dev/null; then
  printf 'Validated migration archive: %s\n' "$archive"
else
  status=$?
  rm -f "$archive"
  docker compose start mempool-matrix
  exit "$status"
fi
```

Inspect the archive listing and confirm expected files such as
`runtime-config.json` are present when they existed in the source. Back up any
useful destination volume before continuing. Only after the archive validates,
extract it into a temporary directory inside the container and then replace the
destination contents:

```bash
docker compose run --rm -T --no-deps --entrypoint sh mempool-matrix \
  -ec 'staging=$(mktemp -d /tmp/matrix-migration.XXXXXX); \
       cleanup_staging() { rm -rf "$staging"; }; \
       trap cleanup_staging EXIT; \
       tar -xzf - -C "$staging"; \
       rm -rf /data/* /data/.[!.]* /data/..?*; \
       cp -a "$staging"/. /data/' \
  < "$archive"
docker compose up -d
```

If archive creation or validation fails, the named volume remains untouched.
After health and persistence checks pass, retain the archive until a later
backup succeeds; archive or remove `./data` separately because Compose no longer
reads it.

## Health, logs, and smoke test

```bash
curl --fail http://localhost:3033/api/health
docker compose ps
docker compose logs --no-log-prefix mempool-matrix
npm run container:smoke
```

The smoke test builds with `--pull`, creates an isolated Compose project with a
fresh named volume, verifies hardened-Compose health and non-root writes, and
checks named-volume persistence across forced recreation. It also keeps a
prepared bind-mount phase for the operator-managed mount scenario, including
HTTP health, runtime-tool exclusions, SIGTERM shutdown, and persistence across
restart and recreation. `/api/health` reports process availability; it does not
probe the configured mempool source.

## Use a compatible local API

Set a URL reachable from the container and ending in `/api`:

```bash
MEMPOOL_API_URL=http://mempool-api:8080/api docker compose up -d --build
```

A hostname such as `mempool-api` requires both services to share a Docker
network. Add the upstream service/network in an override rather than hard-coding
a private deployment into the project file.

## Upgrade and rollback

Record the Git commit and back up the named volume before upgrading:

```bash
git rev-parse HEAD
git pull --ff-only
docker compose build --pull
docker compose up -d
```

If the build fails, check out the recorded commit, rebuild, and recreate the
service while retaining the named volume. Review configuration schema and
release notes before downgrading across versions.

## Image status

No prebuilt image is documented. This guide supports local builds with
`docker compose up --build`. The Dockerfile is multi-stage and pins its Node base
by multi-architecture digest, but this does not itself claim that every
architecture has been runtime-tested. Do not infer a public registry artifact,
SBOM, provenance, or published architecture matrix from the local workflow.
