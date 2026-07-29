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

FROM python:3.12-slim-bookworm
RUN apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 update && \
    apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
      ca-certificates \
      libnl-route-3-200 \
      libprotobuf32 \
      util-linux && \
    rm -rf /var/lib/apt/lists/*

COPY --from=nsjail-build /src/nsjail/nsjail /usr/local/bin/nsjail
COPY --from=jail-rootfs / /opt/xpert-rootfs/
RUN mkdir -p \
      /etc/xpert-nsjail \
      /opt/xpert-rootfs/dev \
      /opt/xpert-rootfs/run \
      /opt/xpert-rootfs/tmp \
      /opt/xpert-rootfs/workspace \
      /sandbox \
      /var/lib/xpert-nsjail && \
    touch \
      /opt/xpert-rootfs/dev/null \
      /opt/xpert-rootfs/dev/random \
      /opt/xpert-rootfs/dev/urandom \
      /opt/xpert-rootfs/dev/zero

COPY .deploy/nsjail-runner/runner.py /app/runner.py
COPY .deploy/nsjail-runner/net_proxy.py /app/net_proxy.py
COPY .deploy/nsjail-runner/poc_validate.py /app/poc_validate.py
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
ENTRYPOINT ["python3", "/app/runner.py"]
