#!/bin/sh
set -ex

# This Entrypoint used when we run Docker container outside of Docker Compose (e.g. in k8s)

echo "Installing Playwright and downloading browsers..."

npx playwright install

exec "$@"
