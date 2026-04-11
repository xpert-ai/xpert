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

RUN apk --update add bash && \
    corepack enable && corepack prepare pnpm@10.24.0 --activate && \
    # apk add --no-cache --virtual build-dependencies dos2unix gcc g++ git make python3 vips-dev && \
    mkdir /srv/xpert && chown -R node:node /srv/xpert

COPY wait .deploy/api/entrypoint.prod.sh .deploy/api/entrypoint.compose.sh /
RUN chmod +x /wait /entrypoint.compose.sh /entrypoint.prod.sh && dos2unix /entrypoint.prod.sh && dos2unix /entrypoint.compose.sh

WORKDIR /srv/xpert

COPY --chown=node:node package.json ./package.json
COPY --chown=node:node pnpm-lock.yaml ./pnpm-lock.yaml
COPY --chown=node:node pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --chown=node:node .npmrc ./.npmrc
COPY --chown=node:node .eslintrc.json ./
COPY nx.json ./
COPY tsconfig.base.json ./
COPY --chown=node:node tailwind-workspace-reference.css ./tailwind-workspace-reference.css
COPY --chown=node:node tailwind.workspace.config.js ./tailwind.workspace.config.js
COPY --chown=node:node tailwind.theme.vars.js ./tailwind.theme.vars.js
COPY --chown=node:node apps ./apps
COPY --chown=node:node packages ./packages
COPY --chown=node:node legacies ./legacies
COPY --chown=node:node libs ./libs

RUN pnpm install --no-frozen-lockfile

RUN pnpm nx build cloud --configuration=production

# ==================================================== Stage ==========================================================#
FROM nginx:alpine AS production

ARG NODE_OPTIONS
ARG NODE_ENV
ARG API_BASE_URL
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
    HOST=${HOST:-0.0.0.0} \
    PORT=${PORT:-80} \
    DEMO=${DEMO:-false}

EXPOSE 80
EXPOSE 443

ENTRYPOINT [ "sh", "./entrypoint.prod.sh" ]

CMD [ "nginx", "-g", "daemon off;" ]

FROM production AS candidate
