ARG HOST
ARG PORT
ARG LOG_LEVEL

FROM node:20-alpine AS build

LABEL maintainer="meta.digital.cloud@gmail.com"
LABEL org.opencontainers.image.source=https://github.com/xpert-ai/xpert

ENV CI=true

RUN apk --update add bash jq && npm i -g npm && \
    corepack enable && corepack prepare pnpm@10.24.0 --activate
RUN mkdir /srv/xpert && chown -R node:node /srv/xpert

USER node:node

WORKDIR /srv/xpert

COPY --chown=node:node legacies/adapter/package.json ./legacies/adapter/
COPY --chown=node:node legacies/copilot/package.json ./legacies/copilot/
COPY --chown=node:node packages/store/package.json ./packages/store/
COPY --chown=node:node packages/core/package.json ./packages/core/
COPY --chown=node:node packages/contracts/package.json ./packages/contracts/
COPY --chown=node:node packages/common/package.json ./packages/common/
COPY --chown=node:node packages/config/package.json ./packages/config/
COPY --chown=node:node packages/auth/package.json ./packages/auth/
COPY --chown=node:node packages/server/package.json ./packages/server/
COPY --chown=node:node packages/server-ai/package.json ./packages/server-ai/
COPY --chown=node:node packages/analytics/package.json ./packages/analytics/
COPY --chown=node:node packages/plugin-sdk/package.json ./packages/plugin-sdk/

COPY --chown=node:node .deploy/api/package.json ./
COPY --chown=node:node pnpm-lock.yaml ./
COPY --chown=node:node pnpm-workspace.yaml ./
COPY --chown=node:node .npmrc ./
COPY --chown=node:node .eslintrc.json ./
COPY --chown=node:node .nxignore ./

RUN pnpm install --no-frozen-lockfile

COPY --chown=node:node nx.json ./
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node packages ./packages
COPY --chown=node:node legacies/adapter ./legacies/adapter
COPY --chown=node:node legacies/copilot ./legacies/copilot
COPY --chown=node:node apps/api ./apps/api
RUN rm -rf packages/angular packages/ui

# Reinstall built-in plugins dependencies
RUN pnpm install --no-frozen-lockfile
RUN pnpm build:plugins
RUN pnpm nx build api --verbose

# COPY --chown=node:node .deploy/api/install-plugins.sh ./
# RUN chmod +x install-plugins.sh
# RUN ./install-plugins.sh

#////////////////////////////////////////////////////////////////////////////////
FROM node:20 AS production

ENV NODE_OPTIONS=${NODE_OPTIONS:-"--max-old-space-size=2048"} \
    NODE_ENV=${NODE_ENV:-production} \
    API_BASE_URL=${API_BASE_URL:-http://localhost:3000} \
    SENTRY_DSN=${SENTRY_DSN} \
    DB_HOST=${DB_HOST:-db} \
    DB_NAME=${DB_NAME:-postgres} \
    DB_PORT=${DB_PORT:-5432} \
    DB_USER=${DB_USER} \
    DB_PASS=${DB_PASS} \
    DB_TYPE=${DB_TYPE:-sqlite} \
    DB_SSL_MODE=${DB_SSL_MODE} \
    HOST=${HOST:-0.0.0.0} \
    PORT=${PORT:-3000} \
    DEMO=${DEMO:-false} \
    LOG_LEVEL=${LOG_LEVEL}

# Install sudo package
RUN apt-get update && apt-get install -y sudo
RUN usermod -aG sudo node
RUN echo "node ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/node
# ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# RUN mkdir -p /ms-playwright && chown -R node:node /ms-playwright
# # Install os dependencies but no browsers
# RUN npx playwright install-deps

# Install python uvx
RUN apt-get install -y python3-pip && \
    python3 -m pip install uv --break-system-packages

WORKDIR /srv/xpert

RUN npm install pm2 -g
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

COPY --chown=node:node wait ./
# COPY dist and dependencies
COPY --chown=node:node --from=build /srv/xpert/dist/legacies ./legacies
COPY --chown=node:node --from=build /srv/xpert/dist/packages ./packages
COPY --chown=node:node --from=build /srv/xpert/packages/contracts/dist ./packages/contracts
COPY --chown=node:node --from=build /srv/xpert/packages/plugin-sdk/dist ./packages/plugin-sdk
COPY --chown=node:node --from=build /srv/xpert/dist/apps/api .
COPY --chown=node:node --from=build /srv/xpert/tsconfig.base.json ./
COPY --chown=node:node --from=build /srv/xpert/pnpm-lock.yaml ./
COPY --chown=node:node --from=build /srv/xpert/pnpm-workspace.yaml ./
COPY --chown=node:node --from=build /srv/xpert/.npmrc ./
COPY --chown=node:node .deploy/api/package-prod.json ./package.json

COPY --chown=node:node .deploy/api/entrypoint.compose.sh ./
COPY --chown=node:node .deploy/api/entrypoint.prod.sh ./
RUN chmod +x wait entrypoint.compose.sh entrypoint.prod.sh

RUN pnpm install --prod --no-frozen-lockfile && \
    touch ormlogs.log && chown -R node:node /srv/xpert

USER node:node

EXPOSE ${PORT}

ENTRYPOINT [ "sh", "./entrypoint.prod.sh" ]
CMD [ "pm2-runtime", "main.js" ]

FROM production AS candidate
