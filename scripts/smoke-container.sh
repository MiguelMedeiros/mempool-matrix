#!/bin/sh
set -eu

CONTEXT=${CONTEXT:-.}
if [ "${IMAGE+x}" = x ]; then
  IMAGE_EXPLICIT=1
else
  IMAGE_EXPLICIT=0
  IMAGE="mempool-matrix:smoke-$$"
fi
PLATFORM=${PLATFORM:-linux/amd64}
NAME="mempool-matrix-smoke-bind-$$"
COMPOSE_PROJECT="mempool-matrix-smoke-$$"
DATA_DIR=$(mktemp -d "${TMPDIR:-/tmp}/mempool-matrix-smoke.XXXXXX")
COMPOSE_ENV=$(mktemp "${TMPDIR:-/tmp}/mempool-matrix-smoke-env.XXXXXX")
HOST_UID=$(id -u)
HOST_GID=$(id -g)
BUILT=0
COMPOSE_STARTED=0
: > "$COMPOSE_ENV"

compose() {
  MEMPOOL_MATRIX_IMAGE="$IMAGE" PORT=0 docker compose \
    --env-file "$COMPOSE_ENV" \
    --project-name "$COMPOSE_PROJECT" \
    --file "$CONTEXT/docker-compose.yml" \
    "$@"
}

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  if [ "$COMPOSE_STARTED" = 1 ]; then
    compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  if docker image inspect "$IMAGE" >/dev/null 2>&1; then
    docker run --rm --user 0:0 -v "$DATA_DIR:/data" "$IMAGE" \
      sh -c 'rm -rf /data/* /data/.[!.]* /data/..?*; chown "$1:$2" /data' \
      sh "$HOST_UID" "$HOST_GID" >/dev/null 2>&1 || true
  fi
  rm -rf "$DATA_DIR"
  rm -f "$COMPOSE_ENV"
  if [ "$IMAGE_EXPLICIT" = 0 ] && [ "$BUILT" = 1 ]; then
    docker image rm "$IMAGE" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ "${SMOKE_SKIP_BUILD:-0}" != "1" ]; then
  docker build --pull --platform "$PLATFORM" \
    --build-arg OCI_REVISION=smoke \
    --build-arg OCI_VERSION=smoke \
    --tag "$IMAGE" "$CONTEXT"
  BUILT=1
fi

image_user=$(docker image inspect --format '{{.Config.User}}' "$IMAGE")
[ "$image_user" = "1000:1000" ] || {
  echo "FAIL: image user is '$image_user', expected 1000:1000" >&2
  exit 1
}
for label in org.opencontainers.image.source org.opencontainers.image.revision org.opencontainers.image.version org.opencontainers.image.licenses org.opencontainers.image.base.digest; do
  value=$(docker image inspect --format "{{index .Config.Labels \"$label\"}}" "$IMAGE")
  [ -n "$value" ] && [ "$value" != "<no value>" ] || {
    echo "FAIL: image label $label is missing" >&2
    exit 1
  }
done

assert_runtime_surface() {
  docker run --rm "$IMAGE" sh -ec '
    for path in \
      /app/src \
      /app/docs \
      /app/assets \
      /app/scripts \
      /app/coverage \
      /app/.git \
      /app/.github \
      /app/.hermes \
      /app/package-lock.json \
      /app/next.config.ts \
      /app/vitest.config.mts \
      /app/tsconfig.json \
      /app/eslint.config.mjs \
      /app/postcss.config.mjs \
      /app/Dockerfile \
      /app/docker-compose.yml \
      /app/README.md \
      /app/LICENSE
    do
      if [ -e "$path" ]; then
        echo "FAIL: non-runtime path leaked into image: $path" >&2
        exit 1
      fi
    done
    test -f /app/server.js
    test -f /app/package.json
    test -d /app/node_modules
    test -d /app/.next/server
  '
}
assert_runtime_surface

wait_healthy() {
  target=$1
  description=$2
  attempts=0
  state=missing
  while [ "$attempts" -lt 90 ]; do
    state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$target" 2>/dev/null || printf missing)
    [ "$state" = healthy ] && return 0
    [ "$state" = unhealthy ] && break
    attempts=$((attempts + 1))
    sleep 1
  done
  docker logs "$target" >&2 || true
  echo "FAIL: $description did not become healthy (state: $state)" >&2
  exit 1
}

# Exercise the stock Compose contract with a brand-new named volume. Docker
# initializes /data from the image metadata, so no root chown helper is involved.
COMPOSE_STARTED=1
compose up -d --no-build
compose_id=$(compose ps -q mempool-matrix)
[ -n "$compose_id" ] || {
  echo "FAIL: Compose did not create the mempool-matrix container" >&2
  exit 1
}
wait_healthy "$compose_id" "Compose container"
docker exec "$compose_id" sh -c '
  test "$(id -u):$(id -g)" = "1000:1000"
  test -w /data
  printf "%s\n" named-volume-persisted > /data/.smoke-volume-marker
'
docker exec "$compose_id" node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{if(!r.ok)throw Error(r.status);const b=await r.json();if(b.status!=='ok')throw Error(JSON.stringify(b))}).catch(e=>{console.error(e);process.exit(1)})"

compose up -d --no-build --force-recreate
recreated_compose_id=$(compose ps -q mempool-matrix)
[ -n "$recreated_compose_id" ] && [ "$recreated_compose_id" != "$compose_id" ] || {
  echo "FAIL: Compose force-recreate did not replace the container" >&2
  exit 1
}
wait_healthy "$recreated_compose_id" "recreated Compose container"
[ "$(docker exec "$recreated_compose_id" cat /data/.smoke-volume-marker)" = "named-volume-persisted" ] || {
  echo "FAIL: named-volume marker did not persist across Compose recreation" >&2
  exit 1
}
docker exec "$recreated_compose_id" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)throw Error(r.status)}).catch(()=>process.exit(1))"
compose down --volumes --remove-orphans
COMPOSE_STARTED=0

# Keep a bind-mount phase for operators who provide a prepared host directory.
# A one-shot root helper prepares only this disposable directory; the stock
# named-volume path above never needs root initialization.
docker run --rm --user 0:0 -v "$DATA_DIR:/data" "$IMAGE" chown 1000:1000 /data
docker run --rm -v "$DATA_DIR:/data" "$IMAGE" \
  sh -c 'printf writable > /data/.ownership-probe && test -w /data/.ownership-probe && ! command -v npm && ! command -v npx && ! command -v corepack && ! command -v yarn && ! command -v yarnpkg'

start_bind_container() {
  docker run -d --name "$NAME" \
    --init \
    -p 127.0.0.1::3000 \
    -v "$DATA_DIR:/data" \
    -e MEMPOOL_CONFIG_PATH=/data/runtime-config.json \
    -e MEMPOOL_HISTORY_DIR=/data/mempool-history \
    "$IMAGE" >/dev/null
}

http_assertions() {
  binding=$(docker port "$NAME" 3000/tcp)
  host_port=${binding##*:}
  BASE_URL="http://127.0.0.1:$host_port" node <<'NODE'
const base = process.env.BASE_URL;
const root = await fetch(`${base}/`);
if (!root.ok) throw new Error(`GET / returned ${root.status}`);
const html = await root.text();
if (!html.includes("<title>mempool.matrix — Bitcoin transaction rain</title>")) {
  throw new Error("expected HTML title was not found");
}
const health = await fetch(`${base}/api/health`);
if (!health.ok) throw new Error(`GET /api/health returned ${health.status}`);
const body = await health.json();
if (body.status !== "ok") throw new Error(`unexpected health body: ${JSON.stringify(body)}`);
NODE
}

assert_bind_persistence() {
  [ "$(docker exec "$NAME" node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('/data/runtime-config.json'));process.stdout.write(c.baseUrl)")" = "https://mempool.space/api" ]
  [ "$(docker exec "$NAME" cat /data/mempool-history/smoke.jsonl)" = "{}" ]
}

start_bind_container
wait_healthy "$NAME" "bind-mount container"
runtime_uid=$(docker exec "$NAME" id -u)
runtime_gid=$(docker exec "$NAME" id -g)
[ "$runtime_uid:$runtime_gid" = "1000:1000" ] || {
  echo "FAIL: runtime identity is $runtime_uid:$runtime_gid" >&2
  exit 1
}
http_assertions

docker exec "$NAME" sh -c 'mkdir -p /data/mempool-history && printf "%s\n" '\''{"version":1,"type":"mempool-api","baseUrl":"https://mempool.space/api","label":"Smoke persisted","updatedAt":"2026-01-01T00:00:00.000Z"}'\'' > /data/runtime-config.json && chmod 600 /data/runtime-config.json && printf "{}\n" > /data/mempool-history/smoke.jsonl'
assert_bind_persistence

docker stop --time 20 "$NAME" >/dev/null
stop_exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$NAME")
stop_oom_killed=$(docker inspect --format '{{.State.OOMKilled}}' "$NAME")
case "$stop_exit_code" in
  0|143) ;;
  *)
    docker logs "$NAME" >&2 || true
    echo "FAIL: SIGTERM stop exit code is $stop_exit_code, expected 0 or 143" >&2
    exit 1
    ;;
esac
[ "$stop_oom_killed" = "false" ] || {
  echo "FAIL: container was OOM-killed during SIGTERM test" >&2
  exit 1
}
docker start "$NAME" >/dev/null
wait_healthy "$NAME" "restarted bind-mount container"
assert_bind_persistence
http_assertions

docker rm -f "$NAME" >/dev/null
start_bind_container
wait_healthy "$NAME" "recreated bind-mount container"
assert_bind_persistence
http_assertions

size_bytes=$(docker image inspect --format '{{.Size}}' "$IMAGE")
image_id=$(docker image inspect --format '{{.Id}}' "$IMAGE")
printf 'PASS image=%s image_id=%s image_user=%s runtime=%s:%s size_bytes=%s named_volume=fresh+recreate bind_persistence=stop-start+recreate sigterm_exit=%s bind_write=ok npm_tools=absent\n' \
  "$IMAGE" "$image_id" "$image_user" "$runtime_uid" "$runtime_gid" "$size_bytes" "$stop_exit_code"
