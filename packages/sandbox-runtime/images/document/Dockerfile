ARG NODE_BASE_IMAGE=node:20.20.2-bookworm-slim@sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c
FROM ${NODE_BASE_IMAGE}

USER root
ENV NODE_ENV=production \
    XPERT_SANDBOX_RUNTIME_ROOT=/opt/xpert/sandbox-runtime \
    HOME=/tmp/xpert/home \
    XDG_CACHE_HOME=/tmp/xpert/cache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 xpert

WORKDIR /opt/xpert/sandbox-runtime
COPY packages/sandbox-runtime/images/browser/runtime/runner-host.mjs ./runner-host.mjs
COPY packages/sandbox-runtime/images/document/runtime/manifest.json ./manifest.json

RUN chown -R root:root /opt/xpert/sandbox-runtime \
    && chmod -R a-w /opt/xpert/sandbox-runtime \
    && chmod 0555 /opt/xpert/sandbox-runtime/runner-host.mjs \
    && mkdir -p /workspace/input /workspace/output /workspace/runtime /tmp/xpert \
    && chown -R xpert:xpert /workspace /tmp/xpert

USER xpert
WORKDIR /workspace
ENTRYPOINT ["node", "/opt/xpert/sandbox-runtime/runner-host.mjs"]
