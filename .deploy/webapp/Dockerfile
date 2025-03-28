ARG NODE_OPTIONS
ARG NODE_ENV
ARG API_BASE_URL
ARG SENTRY_DSN
ARG DEMO

# ==================================================== Stage ==========================================================#
# Copy package.json, Install npm dependencies and Build
FROM node:18-alpine AS build

LABEL maintainer="meta.digital.cloud@gmail.com"

ENV CI=true

RUN apk --update add bash && \
    # apk add --no-cache --virtual build-dependencies dos2unix gcc g++ git make python3 vips-dev && \
    mkdir /srv/pangolin && chown -R node:node /srv/pangolin

COPY wait .deploy/api/entrypoint.prod.sh .deploy/api/entrypoint.compose.sh /
RUN chmod +x /wait /entrypoint.compose.sh /entrypoint.prod.sh && dos2unix /entrypoint.prod.sh && dos2unix /entrypoint.compose.sh

WORKDIR /srv/pangolin

COPY --chown=node:node packages/contracts/package.json ./packages/contracts/
COPY --chown=node:node packages/copilot-angular/package.json ./packages/copilot-angular/
COPY --chown=node:node apps/cloud/package.json ./apps/cloud/

RUN yarn config set network-timeout 300000

COPY --chown=node:node .deploy/webapp/package.json ./package.json
COPY --chown=node:node yarn.lock ./yarn.lock
RUN yarn install

COPY nx.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY libs ./libs
COPY apps/cloud ./apps/cloud

RUN yarn build:cloud:prod

# ==================================================== Stage ==========================================================#
FROM nginx:alpine AS production

ENV API_BASE_URL=${API_BASE_URL:-http://localhost:3000} \
    HOST=${HOST:-0.0.0.0} \
    PORT=${PORT:-80} \
    DEMO=${DEMO:-false}

WORKDIR /srv/pangolin

COPY --chown=nginx:nginx --from=build /wait ./
COPY --chown=nginx:nginx .deploy/webapp/entrypoint.compose.sh ./
COPY --chown=nginx:nginx .deploy/webapp/entrypoint.prod.sh ./
COPY --chown=nginx:nginx .deploy/webapp/nginx.compose.conf /etc/nginx/conf.d/compose.conf.template
COPY --chown=nginx:nginx .deploy/webapp/nginx.prod.conf /etc/nginx/conf.d/prod.conf.template
COPY --chown=nginx:nginx --from=build /srv/pangolin/dist/apps/cloud .

RUN chmod +x wait entrypoint.compose.sh entrypoint.prod.sh && \
    chmod a+rw /etc/nginx/conf.d/compose.conf.template /etc/nginx/conf.d/prod.conf.template

EXPOSE 80
EXPOSE 443

ENTRYPOINT [ "sh", "./entrypoint.prod.sh" ]

CMD [ "nginx", "-g", "daemon off;" ]