#!/bin/sh
set -ex

# This Entrypoint used when we run Docker container outside of Docker Compose (e.g. in k8s)
# No wait here because in prod usually services are already ready

# ---------------------------------------
# Fix ownership of the mounted volume
if [ -d "/srv/pangolin/public" ]; then
  echo "Fixing permissions for /srv/pangolin/public..."
  sudo chown -R node:node /srv/pangolin/public
else
  echo "Warning: /srv/pangolin/public does not exist. Skipping permission fix."
fi
# ---------------------------------------

# Then execute the main command
exec "$@"
