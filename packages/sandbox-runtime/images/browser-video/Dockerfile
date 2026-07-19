ARG NODE_BASE_IMAGE=node:22.17.1-bookworm-slim@sha256:2fa754a9ba4d7adbd2a51d182eaabbe355c82b673624035a38c0d42b08724854
ARG PLAYWRIGHT_BASE_IMAGE=mcr.microsoft.com/playwright:v1.61.0-noble@sha256:111dde95859f2c659291cb60e698f9048a8fc30b35b4ddb7c90f9cb5b73062d9

FROM ${NODE_BASE_IMAGE} AS node-runtime
FROM ${PLAYWRIGHT_BASE_IMAGE}

USER root
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    XPERT_SANDBOX_RUNTIME_ROOT=/opt/xpert/sandbox-runtime \
    HOME=/tmp/xpert/home \
    XDG_CACHE_HOME=/tmp/xpert/cache

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && test "$(node --version)" = "v22.17.1" \
    && apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk fonts-noto-color-emoji \
    && ffmpeg -version | grep -q "ffmpeg version 6.1" \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/xpert/sandbox-runtime
COPY packages/sandbox-runtime/images/browser-video/package.json packages/sandbox-runtime/images/browser-video/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY packages/sandbox-runtime/images/browser/runtime/runner-host.mjs ./runner-host.mjs
COPY packages/sandbox-runtime/images/browser-video/runtime/manifest.json ./manifest.json

RUN chown -R root:root /opt/xpert/sandbox-runtime \
    && chmod -R a-w /opt/xpert/sandbox-runtime \
    && chmod 0555 /opt/xpert/sandbox-runtime/runner-host.mjs \
    && mkdir -p /workspace/input /workspace/output /workspace/runtime /tmp/xpert \
    && chown -R pwuser:pwuser /workspace /tmp/xpert

USER pwuser
WORKDIR /workspace
ENTRYPOINT ["node", "/opt/xpert/sandbox-runtime/runner-host.mjs"]
