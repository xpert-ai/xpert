ARG NODE_BASE_IMAGE=node:20.20.2-bookworm-slim@sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c
ARG PYTHON_BASE_IMAGE=python:3.12.10-slim-bookworm@sha256:fd95fa221297a88e1cf49c55ec1828edd7c5a428187e67b5d1805692d11588db
FROM ${NODE_BASE_IMAGE} AS node
FROM ${PYTHON_BASE_IMAGE}

USER root
COPY --from=node /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production \
    XPERT_SANDBOX_RUNTIME_ROOT=/opt/xpert/sandbox-runtime \
    PATH=/opt/xpert/sandbox-runtime/python/bin:$PATH \
    HOME=/tmp/xpert/home \
    XDG_CACHE_HOME=/tmp/xpert/cache \
    PYTHONDONTWRITEBYTECODE=1
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 libgomp1 \
    && rm -rf /var/lib/apt/lists/* && useradd --create-home --uid 10001 xpert
WORKDIR /opt/xpert/sandbox-runtime
COPY packages/sandbox-runtime/images/document-python/requirements.txt ./requirements.txt
RUN python3 -m venv /opt/xpert/sandbox-runtime/python \
    && python/bin/python -m pip install --no-cache-dir --require-hashes -r requirements.txt
COPY packages/sandbox-runtime/images/browser/runtime/runner-host.mjs ./runner-host.mjs
COPY packages/sandbox-runtime/images/document-python/runtime/manifest.json ./manifest.json
COPY packages/sandbox-runtime/images/document-python/runtime/verify-python.py ./verify-python.py
RUN python3 -I verify-python.py manifest.json requirements.txt \
    && chown -R root:root /opt/xpert/sandbox-runtime && chmod -R a-w /opt/xpert/sandbox-runtime \
    && mkdir -p /workspace/input /workspace/output /workspace/runtime /tmp/xpert \
    && chown -R xpert:xpert /workspace /tmp/xpert
USER xpert
WORKDIR /workspace
ENTRYPOINT ["node", "/opt/xpert/sandbox-runtime/runner-host.mjs"]
