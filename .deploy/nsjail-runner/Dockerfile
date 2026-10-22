ARG DOCUMENT_NODE_ROOTFS=document-node-build
ARG DOCUMENT_JAVA_ROOTFS=document-java-build
ARG NSJAIL_VERSION=3.6
ARG NSJAIL_COMMIT=f78475530b46d0186111a9096b30725f816b55fe

FROM debian:bookworm-slim AS nsjail-build
ARG NSJAIL_VERSION
ARG NSJAIL_COMMIT
RUN apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 update && \
    apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
      autoconf \
      bison \
      ca-certificates \
      flex \
      g++ \
      gcc \
      git \
      libnl-route-3-dev \
      libprotobuf-dev \
      libtool \
      make \
      pkg-config \
      protobuf-compiler && \
    git clone --depth 1 --branch "${NSJAIL_VERSION}" https://github.com/google/nsjail.git /src/nsjail && \
    test "$(git -C /src/nsjail rev-parse HEAD)" = "${NSJAIL_COMMIT}" && \
    make -C /src/nsjail -j"$(nproc)"

FROM node:20-bookworm-slim AS jail-rootfs
RUN apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 update && \
    apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
      bash \
      ca-certificates \
      coreutils \
      curl \
      findutils \
      git \
      grep \
      procps \
      python3 \
      sed \
      tar \
      util-linux && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /workspace /tmp /run /proc

# Compute uses the same pinned interpreters and Runner Host as the OSS Runtime Suite.
FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS compute-node
FROM python:3.12-slim-bookworm@sha256:782412e85d0f0984994c290652577d4018aff08145c85b262bb63dc0c7522254 AS compute-rootfs
COPY --from=compute-node /usr/local/bin/node /usr/local/bin/node
COPY packages/sandbox-runtime/images/browser/runtime/runner-host.mjs /opt/xpert/sandbox-runtime/runner-host.mjs
COPY packages/sandbox-runtime/images/compute/runtime/manifest.json /opt/xpert/sandbox-runtime/manifest.json
COPY packages/sandbox-runtime/images/compute/runtime/smoke.mjs /opt/xpert/sandbox-runtime/compute-smoke.mjs
COPY packages/server-ai/src/sandbox/sandbox-job/runtime-definitions/compute-node-python-v1.json /opt/xpert/sandbox-runtime/definition.json
COPY .deploy/nsjail-runner/compute-probe.mjs /opt/xpert/sandbox-runtime/nsjail-probe.mjs
RUN mkdir -p /workspace/input /workspace/output /workspace/runtime /workspace/invocations /dev/shm /proc /tmp /run && \
    touch /dev/null /dev/zero /dev/random /dev/urandom

# Document dependencies are built from the same locked OSS sources as the Runtime images.
FROM node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS document-node-build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip fontconfig fonts-dejavu-core fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
COPY packages/sandbox-runtime/images/document-node/dependencies.lock.json /opt/xpert/sandbox-runtime/dependencies.lock.json
COPY packages/sandbox-runtime/images/document-node/runtime/manifest.json /opt/xpert/sandbox-runtime/manifest.json
COPY packages/sandbox-runtime/images/browser/runtime/runner-host.mjs /opt/xpert/sandbox-runtime/runner-host.mjs
COPY packages/sandbox-runtime/scripts/install-document-dependencies.mjs packages/sandbox-runtime/scripts/verify-document-runtime.mjs /opt/xpert/sandbox-runtime/
RUN node /opt/xpert/sandbox-runtime/install-document-dependencies.mjs --family document-node --destination /opt/xpert/document-dependencies --lock /opt/xpert/sandbox-runtime/dependencies.lock.json
ENV XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT=/opt/xpert/document-dependencies \
    XPERT_SANDBOX_RUNTIME_MANIFEST_PATH=/opt/xpert/sandbox-runtime/manifest.json \
    HOME=/tmp/xpert TMPDIR=/tmp/xpert
RUN mkdir -p /tmp/xpert && node /opt/xpert/sandbox-runtime/verify-document-runtime.mjs /opt/xpert/sandbox-runtime/manifest.json /opt/xpert/sandbox-runtime/dependencies.lock.json /opt/xpert/document-dependencies \
 && groupadd --gid 10001 sandbox && useradd --uid 10001 --gid 10001 --no-create-home sandbox \
 && mkdir -p /workspace/input /workspace/output /workspace/runtime /tmp/xpert \
 && chown -R 10001:10001 /workspace /tmp/xpert

FROM ${DOCUMENT_NODE_ROOTFS} AS document-node-rootfs
USER root
COPY packages/server-ai/src/sandbox/sandbox-job/runtime-definitions/document-node-20-v1.json /opt/xpert/sandbox-runtime/definition.json
COPY .deploy/nsjail-runner/document-probe.mjs /opt/xpert/sandbox-runtime/nsjail-probe.mjs
RUN mkdir -p /workspace/input /workspace/output /workspace/runtime /workspace/invocations /dev/shm /proc /tmp /run && \
    touch /dev/null /dev/zero /dev/random /dev/urandom

FROM node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS document-java-node
FROM python:3.12.10-slim-bookworm@sha256:fd95fa221297a88e1cf49c55ec1828edd7c5a428187e67b5d1805692d11588db AS document-java-build
COPY --from=document-java-node /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip fontconfig fonts-dejavu-core fonts-noto-cjk libgomp1 libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
COPY packages/sandbox-runtime/images/document-java/dependencies.lock.json /opt/xpert/sandbox-runtime/dependencies.lock.json
COPY packages/sandbox-runtime/images/document-java/requirements.txt packages/sandbox-runtime/images/document-java/models.lock.json /opt/xpert/sandbox-runtime/
COPY packages/sandbox-runtime/images/document-java/runtime/hybrid-backend.py /opt/xpert/sandbox-runtime/runtime/hybrid-backend.py
COPY packages/sandbox-runtime/images/document-java/runtime/manifest.json /opt/xpert/sandbox-runtime/manifest.json
COPY packages/sandbox-runtime/images/browser/runtime/runner-host.mjs /opt/xpert/sandbox-runtime/runner-host.mjs
COPY packages/sandbox-runtime/scripts/install-document-dependencies.mjs packages/sandbox-runtime/scripts/install-document-ocr.mjs packages/sandbox-runtime/scripts/verify-document-runtime.mjs /opt/xpert/sandbox-runtime/
RUN node /opt/xpert/sandbox-runtime/install-document-dependencies.mjs --family document-java --destination /opt/xpert/document-dependencies --lock /opt/xpert/sandbox-runtime/dependencies.lock.json --python /usr/local/bin/python3
ENV XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT=/opt/xpert/document-dependencies \
    XPERT_SANDBOX_RUNTIME_MANIFEST_PATH=/opt/xpert/sandbox-runtime/manifest.json \
    HOME=/tmp/xpert TMPDIR=/tmp/xpert
RUN mkdir -p /tmp/xpert && node /opt/xpert/sandbox-runtime/verify-document-runtime.mjs /opt/xpert/sandbox-runtime/manifest.json /opt/xpert/sandbox-runtime/dependencies.lock.json /opt/xpert/document-dependencies \
 && groupadd --gid 10001 sandbox && useradd --uid 10001 --gid 10001 --no-create-home sandbox \
 && mkdir -p /workspace/input /workspace/output /workspace/runtime /tmp/xpert \
 && chown -R 10001:10001 /workspace /tmp/xpert

FROM ${DOCUMENT_JAVA_ROOTFS} AS document-java-rootfs
USER root
COPY packages/server-ai/src/sandbox/sandbox-job/runtime-definitions/document-java-17-v1.json /opt/xpert/sandbox-runtime/definition.json
COPY .deploy/nsjail-runner/document-probe.mjs /opt/xpert/sandbox-runtime/nsjail-probe.mjs
RUN mkdir -p /workspace/input /workspace/output /workspace/runtime /workspace/invocations /dev/shm /proc /tmp /run && \
    touch /dev/null /dev/zero /dev/random /dev/urandom

FROM python:3.12-slim-bookworm
RUN apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 update && \
    apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
      ca-certificates \
      conntrack \
      iproute2 \
      libnl-route-3-200 \
      libprotobuf32 \
      nftables \
      util-linux && \
    rm -rf /var/lib/apt/lists/*

COPY --from=nsjail-build /src/nsjail/nsjail /usr/local/bin/nsjail
COPY --from=jail-rootfs / /opt/xpert-rootfs/
COPY --from=compute-rootfs / /opt/xpert-compute-rootfs/
COPY --from=document-node-rootfs / /opt/xpert-document-node-rootfs/
COPY --from=document-java-rootfs / /opt/xpert-document-java-rootfs/
RUN mkdir -p \
      /opt/xpert-app-data-mask \
      /etc/xpert-nsjail \
      /opt/xpert-rootfs/dev \
      /opt/xpert-rootfs/run \
      /opt/xpert-rootfs/tmp \
      /opt/xpert-rootfs/workspace \
      /opt/xpert-compute-rootfs/dev/shm \
      /opt/xpert-document-node-rootfs/dev/shm \
      /opt/xpert-document-java-rootfs/dev/shm \
      /opt/xpert-document-java-rootfs/sys/devices/system/cpu \
      /sandbox \
      /var/lib/xpert-nsjail && \
    chmod 0555 /opt/xpert-app-data-mask && \
    touch \
      /opt/xpert-rootfs/dev/null \
      /opt/xpert-rootfs/dev/random \
      /opt/xpert-rootfs/dev/urandom \
      /opt/xpert-rootfs/dev/zero
RUN touch /opt/xpert-compute-rootfs/dev/null /opt/xpert-compute-rootfs/dev/zero \
      /opt/xpert-compute-rootfs/dev/random /opt/xpert-compute-rootfs/dev/urandom
# Docker does not copy the build stages' transient /dev mounts into these rootfs trees.
RUN for root in /opt/xpert-document-node-rootfs /opt/xpert-document-java-rootfs; do \
      touch "$root/dev/null" "$root/dev/zero" "$root/dev/random" "$root/dev/urandom"; \
    done

COPY .deploy/nsjail-runner/runner.py /app/runner.py
COPY .deploy/nsjail-runner/server.py .deploy/nsjail-runner/compute_*.py .deploy/nsjail-runner/document_service.py /app/
COPY .deploy/nsjail-runner/network.py /app/network.py
COPY .deploy/nsjail-runner/net_proxy.py /app/net_proxy.py
COPY .deploy/nsjail-runner/poc_validate.py /app/poc_validate.py
COPY .deploy/nsjail-runner/verify_app_data.py /app/verify_app_data.py
COPY .deploy/nsjail-runner/verify_compute.py .deploy/nsjail-runner/verify_documents.py /app/
COPY .deploy/nsjail-runner/seccomp.policy /etc/xpert-nsjail/seccomp.policy
RUN chmod 0755 /app/runner.py /app/net_proxy.py /app/poc_validate.py /usr/local/bin/nsjail

ENV PYTHONUNBUFFERED=1 \
    XPERT_NSJAIL_ROOTFS=/opt/xpert-rootfs \
    XPERT_NSJAIL_RUNNER_HOST=0.0.0.0 \
    XPERT_NSJAIL_RUNNER_PORT=8090 \
    XPERT_NSJAIL_SECCOMP_POLICY=/etc/xpert-nsjail/seccomp.policy \
    XPERT_NSJAIL_STATE_ROOT=/var/lib/xpert-nsjail \
    XPERT_NSJAIL_WORKSPACE_ROOT=/sandbox

EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD ["python3", "-c", "import os,urllib.request;req=urllib.request.Request('http://127.0.0.1:8090/health',headers={'Authorization':'Bearer '+os.environ['XPERT_NSJAIL_RUNNER_TOKEN']});urllib.request.urlopen(req,timeout=2)"]
ENTRYPOINT ["python3", "/app/server.py"]
