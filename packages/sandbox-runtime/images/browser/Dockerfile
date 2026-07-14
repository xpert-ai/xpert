ARG NODE_BASE_IMAGE=node:20.20.2-bookworm-slim@sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c
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
    && test "$(node --version)" = "v20.20.2" \
    && apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/xpert/sandbox-runtime
COPY packages/sandbox-runtime/images/browser/package.json packages/sandbox-runtime/images/browser/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY packages/sandbox-runtime/images/browser/runtime/runner-host.mjs ./runner-host.mjs
COPY packages/sandbox-runtime/images/browser/runtime/manifest.json ./manifest.json

RUN chown -R root:root /opt/xpert/sandbox-runtime \
    && chmod -R a-w /opt/xpert/sandbox-runtime \
    && chmod 0555 /opt/xpert/sandbox-runtime/runner-host.mjs \
    && mkdir -p /workspace/input /workspace/output /workspace/runtime /tmp/xpert \
    && chown -R pwuser:pwuser /workspace /tmp/xpert

USER pwuser
WORKDIR /workspace
ENTRYPOINT ["node", "/opt/xpert/sandbox-runtime/runner-host.mjs"]
