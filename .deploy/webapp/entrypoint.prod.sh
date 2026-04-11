#!/bin/sh
set -ex

# This Entrypoint used when we run Docker container outside of Docker Compose (e.g. in k8s)

# In production we should replace some values in generated JS code
sed -i "s#DOCKER_API_BASE_URL#$API_BASE_URL#g" *.js
sed -i "s#DOCKER_CHATKIT_FRAME_URL#$CHATKIT_FRAME_URL#g" *.js
sed -i "s#\"DOCKER_ENABLE_LOCAL_AGENT\"#$ENABLE_LOCAL_AGENT#g" *.js
sed -i "s#DOCKER_CLIENT_BASE_URL#$CLIENT_BASE_URL#g" *.js
sed -i "s#DOCKER_SENTRY_DSN#$SENTRY_DSN#g" *.js
sed -i "s#DOCKER_CLOUDINARY_CLOUD_NAME#$CLOUDINARY_CLOUD_NAME#g" *.js
sed -i "s#DOCKER_CLOUDINARY_API_KEY#$CLOUDINARY_API_KEY#g" *.js
sed -i "s#DOCKER_DEFAULT_LATITUDE#$DEFAULT_LATITUDE#g" *.js
sed -i "s#DOCKER_DEFAULT_LONGITUDE#$DEFAULT_LONGITUDE#g" *.js
sed -i "s#DOCKER_DEFAULT_CURRENCY#$DEFAULT_CURRENCY#g" *.js
sed -i "s#DOCKER_DEMO#$DEMO#g" *.js

# We may not need to use that env vars now in nginx.config, but we may want later. 
# Also we just need to copy nginx.conf to correct place anyway...
envsubst '' < /etc/nginx/conf.d/prod.conf.template > /etc/nginx/nginx.conf

exec "$@"
