# Umbrel

> **Status: draft.** The package architecture below is planned for the first
> public release. It is not an official Umbrel App Store listing, has not been
> submitted, and should not be described as prepared for submission until the
> package artifacts, released image digest, official lint, and lifecycle tests
> exist.

## Planned package contract

| Field | Value |
| --- | --- |
| App ID | `mempool-matrix` |
| Manifest port | `3033` |
| Dependency | `mempool` |
| Application container port | `3000` behind `app_proxy` |
| Persistent root | `${APP_DATA_DIR}/data` mounted at `/data` |

The package will depend on Umbrel's `mempool` app, which exports
`APP_MEMPOOL_IP` and `APP_MEMPOOL_PORT`. The web service will derive its source
without Bitcoin RPC credentials:

```yaml
environment:
  MEMPOOL_API_URL: "http://${APP_MEMPOOL_IP}:${APP_MEMPOOL_PORT}/api"
  MEMPOOL_CONFIG_PATH: /data/runtime-config.json
  MEMPOOL_SETTINGS_TOKEN: "${APP_PASSWORD}"
  MEMPOOL_HISTORY_DIR: /data/mempool-history
  MEMPOOL_HISTORY_INTERVAL_MS: "60000"
  MEMPOOL_HISTORY_RETENTION_DAYS: "30"
volumes:
  - ${APP_DATA_DIR}/data:/data
```

Normal visualization remains behind Umbrel's `app_proxy` and does not require a
second login. The deterministic `APP_PASSWORD` is intended only as the Bearer
token for advanced source testing and changes.

## Package shape

The canonical package is planned under:

```text
packaging/umbrel/mempool-matrix/
├── umbrel-app.yml
├── docker-compose.yml
└── data/.gitkeep
```

The manifest ID and directory name must both be exactly `mempool-matrix`. The
manifest will declare `dependencies: [mempool]` and `port: 3033`.

The Umbrel Compose package must use a released public image pinned by both
version and multi-architecture digest. It must not contain `build:`, raw
`ports:`, `container_name`, host networking, privileged mode, the Docker socket,
devices, broad host mounts, or a custom top-level network.

No image reference is included in this draft because no verified public release
artifact is currently claimed.

## Persistence and updates

Runtime configuration and history are intended to live below
`${APP_DATA_DIR}/data`, mapped to `/data`. Package testing must prove that both
survive Umbrel restart, stop/start, app recreation, and update flows. Backward
compatibility of persisted data must be reviewed for every release.

The package image must demonstrate write access to `/data` with its declared
runtime user before submission. No verified public package image is claimed here.

## Required release evidence

Before changing this page to “prepared for submission,” complete and record:

1. A public immutable release image for `linux/amd64` and `linux/arm64`
2. The multi-architecture index digest
3. Non-root startup and writable `/data` verification
4. Official Umbrel app lint with image checks
5. Fresh install with the `mempool` dependency
6. Launch through `app_proxy`
7. Live transactions, search, transaction details, and `/stats`
8. Advanced-settings authentication with the deterministic password
9. Restart and persistence tests
10. Settled logs and an arm64 runtime smoke test

Only after those gates pass should an official App Store pull request be opened
and linked from the manifest. Review feedback may change fields, wording, port,
or runtime details; this document should track the accepted package rather than
predicting acceptance.
