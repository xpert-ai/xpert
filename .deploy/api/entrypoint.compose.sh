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

if [ -n "$PLUGINS" ]; then
  echo "Installing plugins: $PLUGINS"
  # Replace commas with spaces to separate plugin names
  PLUGINS_LIST=$(echo "$PLUGINS" | tr ',' ' ')
  npm install $PLUGINS_LIST --legacy-peer-deps
fi

# Then execute the main command
exec "$@"
