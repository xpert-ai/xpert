#!/bin/sh
set -ex

echo "Installing Playwright and downloading browsers..."

npx playwright install

# This Entrypoint used inside Docker Compose only

export WAIT_HOSTS=$DB_HOST:$DB_PORT

# in Docker Compose we should wait other services start
./wait

exec "$@"
