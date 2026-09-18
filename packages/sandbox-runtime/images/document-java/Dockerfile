FROM node:20.20.2-bookworm-slim@sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c AS node
FROM python:3.12.10-slim-bookworm@sha256:fd95fa221297a88e1cf49c55ec1828edd7c5a428187e67b5d1805692d11588db
COPY --from=node /usr/local/bin/node /usr/local/bin/node
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
LABEL org.xpert.sandbox.runtime-profile="document/java-17/v1" org.xpert.sandbox.runtime-suite-version="1.2.1"
USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["node", "/opt/xpert/sandbox-runtime/runner-host.mjs"]
