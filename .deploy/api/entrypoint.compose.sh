#!/bin/sh
set -ex

# This Entrypoint used inside Docker Compose only

export WAIT_HOSTS=$DB_HOST:$DB_PORT

# in Docker Compose we should wait other services start
./wait

# ---------------------------------------
# Fix ownership of the mounted volume
# /srv/pangolin/public might be owned by root after volume mount
if [ -d "/srv/pangolin/public" ]; then
  echo "Fixing permissions for /srv/pangolin/public..."
  sudo chown -R node:node /srv/pangolin/public
else
  echo "Warning: /srv/pangolin/public does not exist. Skipping permission fix."
fi
# ---------------------------------------

# Then execute the main command
exec "$@"
