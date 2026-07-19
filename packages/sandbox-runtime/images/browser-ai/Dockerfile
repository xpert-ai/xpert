ARG NODE_BASE_IMAGE=node:20.20.2-bookworm-slim@sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c
ARG PLAYWRIGHT_BASE_IMAGE=mcr.microsoft.com/playwright:v1.61.0-noble@sha256:111dde95859f2c659291cb60e698f9048a8fc30b35b4ddb7c90f9cb5b73062d9

FROM ${NODE_BASE_IMAGE} AS ai-resources
WORKDIR /build
COPY packages/sandbox-runtime/scripts/install-ai-resources.mjs ./install-ai-resources.mjs
COPY packages/sandbox-runtime/images/browser-ai/resources/resource-catalog.json ./resource-catalog.json
RUN node ./install-ai-resources.mjs --catalog ./resource-catalog.json --output /runtime-artifacts --resource onnxruntime-web-1.26.0-dev.20260416-b7804b056c
RUN node ./install-ai-resources.mjs --catalog ./resource-catalog.json --output /runtime-artifacts --resource xenova-whisper-tiny-q4

FROM ${NODE_BASE_IMAGE} AS node-runtime
FROM ${PLAYWRIGHT_BASE_IMAGE}

USER root
LABEL org.xpert.sandbox.runtime-profile="browser/ai-playwright-1.61/v1" \
    org.xpert.sandbox.runtime-suite-version="1.1.0" \
    org.xpert.sandbox.model-catalog-sha256="4b8344e62b18ef86798cb005e704757fb67357c1e264dbd4d4f8cec42a81ba2b"
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    XPERT_SANDBOX_RUNTIME_ROOT=/opt/xpert/sandbox-runtime \
    XPERT_SANDBOX_RUNTIME_ARTIFACT_ROOT=/opt/xpert/sandbox-runtime/artifacts \
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
COPY packages/sandbox-runtime/images/browser-ai/package.json packages/sandbox-runtime/images/browser-ai/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY packages/sandbox-runtime/images/browser/runtime/runner-host.mjs ./runner-host.mjs
COPY packages/sandbox-runtime/images/browser-ai/runtime/manifest.json ./manifest.json
COPY packages/sandbox-runtime/scripts/install-ai-resources.mjs ./verify-ai-resources.mjs
COPY packages/sandbox-runtime/images/browser-ai/resources/resource-catalog.json ./artifacts/catalog.json
COPY --from=ai-resources /runtime-artifacts/onnxruntime ./artifacts/onnxruntime
COPY --from=ai-resources /runtime-artifacts/models/xenova-whisper-tiny-q4 ./artifacts/models/xenova-whisper-tiny-q4

RUN node ./verify-ai-resources.mjs --catalog ./artifacts/catalog.json --output ./artifacts --verify-only \
    && chown -R root:root /opt/xpert/sandbox-runtime \
    && chmod -R a+rX,a-w /opt/xpert/sandbox-runtime \
    && chmod 0555 /opt/xpert/sandbox-runtime/runner-host.mjs /opt/xpert/sandbox-runtime/verify-ai-resources.mjs \
    && mkdir -p /workspace/input /workspace/output /workspace/runtime /tmp/xpert \
    && chown -R pwuser:pwuser /workspace /tmp/xpert

USER pwuser
WORKDIR /workspace
ENTRYPOINT ["node", "/opt/xpert/sandbox-runtime/runner-host.mjs"]
