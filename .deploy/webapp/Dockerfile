ARG NODE_OPTIONS
ARG NODE_ENV
ARG API_BASE_URL
ARG SENTRY_DSN
ARG DEMO

# ==================================================== Stage ==========================================================#
# Copy package.json, Install npm dependencies and Build
FROM node:20-alpine AS build

LABEL maintainer="meta.digital.cloud@gmail.com"
LABEL org.opencontainers.image.source="https://github.com/xpert-ai/xpert"

ENV CI=true

# We make NODE_OPTIONS and other env vars passed as build argument to be available in this stage
ARG NODE_OPTIONS

ENV NODE_OPTIONS=${NODE_OPTIONS:-"--max-old-space-size=4096"}

RUN apk add --no-cache bash && \
    corepack enable && corepack prepare pnpm@10.24.0 --activate && \
    mkdir /srv/xpert && chown -R node:node /srv/xpert

COPY wait .deploy/api/entrypoint.prod.sh .deploy/api/entrypoint.compose.sh /
RUN chmod +x /wait /entrypoint.compose.sh /entrypoint.prod.sh && dos2unix /entrypoint.prod.sh && dos2unix /entrypoint.compose.sh

WORKDIR /srv/xpert

# Install only Cloud and its shared frontend libraries, before copying sources.
COPY --chown=node:node .deploy/webapp/package.json ./package.json
COPY --chown=node:node .deploy/webapp/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --chown=node:node pnpm-workspace.yaml .npmrc ./
COPY --chown=node:node apps/cloud/package.json ./apps/cloud/
COPY --chown=node:node packages/contracts/package.json ./packages/contracts/
COPY --chown=node:node packages/ui/package.json ./packages/ui/
COPY --chown=node:node libs/formly/package.json ./libs/formly/
COPY --chown=node:node .deploy/webapp/dependencies.cjs ./.deploy/webapp/
RUN pnpm install --frozen-lockfile && node .deploy/webapp/dependencies.cjs check-installed

COPY --chown=node:node .eslintrc.json .nxignore nx.json tsconfig.base.json ./
COPY --chown=node:node tailwind-workspace-reference.css tailwind.workspace.config.js tailwind.theme.vars.js ./
COPY --chown=node:node apps/cloud ./apps/cloud
COPY --chown=node:node packages/contracts ./packages/contracts
COPY --chown=node:node packages/ui ./packages/ui
COPY --chown=node:node libs/formly ./libs/formly
# Connector contracts are browser-safe source; do not install the server SDK.
COPY --chown=node:node packages/plugin-sdk/src/connector.ts ./packages/plugin-sdk/src/
COPY --chown=node:node packages/plugin-sdk/src/lib/connector/strategy.interface.ts ./packages/plugin-sdk/src/lib/connector/
RUN pnpm install --lockfile-only --frozen-lockfile --ignore-scripts --offline

RUN pnpm nx build cloud --configuration=production --verbose

# ==================================================== Stage ==========================================================#
FROM nginx:alpine AS production

ARG NODE_OPTIONS
ARG NODE_ENV
ARG API_BASE_URL
ARG WEBAPP_API_BASE_URL
ARG CODE_XPERT_URL
ARG DATA_ONTOLOGY_URL
ARG HOST
ARG PORT
ARG DEMO

WORKDIR /srv/xpert

COPY --chown=nginx:nginx --from=build /wait ./
COPY --chown=nginx:nginx .deploy/webapp/entrypoint.compose.sh ./
COPY --chown=nginx:nginx .deploy/webapp/entrypoint.prod.sh ./
COPY --chown=nginx:nginx .deploy/webapp/nginx.compose.conf /etc/nginx/conf.d/compose.conf.template
COPY --chown=nginx:nginx .deploy/webapp/nginx.prod.conf /etc/nginx/conf.d/prod.conf.template
COPY --chown=nginx:nginx --from=build /srv/xpert/dist/apps/cloud/browser .
COPY --chown=nginx:nginx --from=build /srv/xpert/node_modules/@xpert-ai/chatkit-ui/dist/app ./chatkit

RUN sed -i 's#"/assets/#"/chatkit/assets/#g' /srv/xpert/chatkit/index.html

RUN chmod +x wait entrypoint.compose.sh entrypoint.prod.sh && \
    chmod a+rw /etc/nginx/conf.d/compose.conf.template /etc/nginx/conf.d/prod.conf.template

ENV CI=true

ENV NODE_OPTIONS=${NODE_OPTIONS:-"--max-old-space-size=12288"}
ENV NODE_ENV=${NODE_ENV:-production}

ENV API_BASE_URL=${API_BASE_URL:-http://localhost:3000} \
    WEBAPP_API_BASE_URL=${WEBAPP_API_BASE_URL:-} \
    CODE_XPERT_URL=${CODE_XPERT_URL:-https://code.xpertai.cn/} \
    DATA_ONTOLOGY_URL=${DATA_ONTOLOGY_URL:-https://data.xpertai.cn/} \
    HOST=${HOST:-0.0.0.0} \
    PORT=${PORT:-80} \
    DEMO=${DEMO:-false}

EXPOSE 80
EXPOSE 443

ENTRYPOINT [ "sh", "./entrypoint.prod.sh" ]

CMD [ "nginx", "-g", "daemon off;" ]

FROM production AS candidate
