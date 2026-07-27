# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:22.23.1-alpine3.23@sha256:8516dce0483394d5708d4b2ee6cacb79fb1d617ea4e2787c2120bcca92ce372e AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22.23.1-alpine3.23@sha256:8516dce0483394d5708d4b2ee6cacb79fb1d617ea4e2787c2120bcca92ce372e AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.23.1-alpine3.23@sha256:8516dce0483394d5708d4b2ee6cacb79fb1d617ea4e2787c2120bcca92ce372e AS runner
WORKDIR /app

ARG OCI_SOURCE="https://github.com/MiguelMedeiros/mempool-matrix"
ARG OCI_REVISION="unknown"
ARG OCI_VERSION="0.0.0-dev"
ARG OCI_LICENSES="MIT"
LABEL org.opencontainers.image.title="Mempool Matrix" \
      org.opencontainers.image.description="A live visualization and explorer for the Bitcoin mempool" \
      org.opencontainers.image.source="$OCI_SOURCE" \
      org.opencontainers.image.revision="$OCI_REVISION" \
      org.opencontainers.image.version="$OCI_VERSION" \
      org.opencontainers.image.licenses="$OCI_LICENSES" \
      org.opencontainers.image.base.name="docker.io/library/node:22.23.1-alpine3.23" \
      org.opencontainers.image.base.digest="sha256:8516dce0483394d5708d4b2ee6cacb79fb1d617ea4e2787c2120bcca92ce372e"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=384 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The traced server needs Node, not npm or Corepack. The pre-owned mount point
# also lets Docker initialize a fresh named volume with UID/GID 1000.
RUN rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg \
      /opt/yarn* \
    && mkdir -p /data \
    && chown 1000:1000 /data \
    && node --version
# Allowlist the standalone payload instead of copying its root wholesale. The
# instrumentation trace is intentionally conservative because history paths
# are dynamic; source and project files must never enter a final image layer.
COPY --from=builder --chown=1000:1000 /app/.next/standalone/server.js ./server.js
COPY --from=builder --chown=1000:1000 /app/.next/standalone/package.json ./package.json
COPY --from=builder --chown=1000:1000 /app/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=1000:1000 /app/.next/standalone/.next ./.next
COPY --from=builder --chown=1000:1000 /app/.next/static ./.next/static
COPY --from=builder --chown=1000:1000 /app/public ./public

USER 1000:1000
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)throw Error(r.status)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
