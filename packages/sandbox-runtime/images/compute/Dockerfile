FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS node
FROM python:3.12-slim-bookworm@sha256:782412e85d0f0984994c290652577d4018aff08145c85b262bb63dc0c7522254
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY packages/sandbox-runtime/images/browser/runtime/runner-host.mjs /opt/xpert/sandbox-runtime/runner-host.mjs
COPY packages/sandbox-runtime/images/compute/runtime/manifest.json /opt/xpert/sandbox-runtime/manifest.json
COPY packages/sandbox-runtime/images/compute/runtime/smoke.mjs /opt/xpert/sandbox-runtime/compute-smoke.mjs
RUN groupadd --gid 10001 sandbox && useradd --uid 10001 --gid 10001 --no-create-home sandbox && mkdir -p /workspace/input /workspace/output /workspace/runtime /workspace/invocations
ENV HOME=/tmp/home PYTHONDONTWRITEBYTECODE=1
USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["node", "/opt/xpert/sandbox-runtime/runner-host.mjs"]
