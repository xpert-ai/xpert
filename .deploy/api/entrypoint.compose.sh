#!/bin/sh
set -ex

# This Entrypoint used inside Docker Compose only

export WAIT_HOSTS=$DB_HOST:$DB_PORT

# in Docker Compose we should wait other services start
./wait

# ---------------------------------------
# Fix ownership of the mounted volume
folders="/srv/pangolin/public /sandbox /ms-playwright"

for folder in $folders; do
  if [ -d "$folder" ]; then
    echo "Fixing permissions for $folder..."
    sudo chown -R node:node "$folder"
  else
    echo "Warning: $folder does not exist. Skipping permission fix."
  fi
done
# ---------------------------------------

# Then execute the main command
exec "$@"
