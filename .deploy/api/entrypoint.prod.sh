#!/bin/sh
set -ex

# This Entrypoint used when we run Docker container outside of Docker Compose (e.g. in k8s)
# No wait here because in prod usually services are already ready

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
