#!/usr/bin/env bash
# NsJail assembles multiple rootfs trees while retaining their build layers.
# Only disposable GitHub-hosted Linux runners may remove these unused SDKs.
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted || "${RUNNER_OS:-}" != Linux ]]; then
  echo 'Refusing SDK cleanup outside a GitHub-hosted Linux Actions runner.' >&2
  exit 1
fi

echo 'Disk usage before removing unused host SDKs:'
df -h /
docker system df

# Keep Docker, Node, Python, the checkout and the rest of the tool cache intact.
sudo rm -rf -- /usr/local/lib/android /usr/share/dotnet /usr/share/swift \
  /usr/local/.ghcup /opt/ghc /opt/hostedtoolcache/CodeQL
sudo apt-get clean

echo 'Disk usage available for the NsJail build:'
df -h /
available_kib="$(df -Pk /var/lib/docker | awk 'NR == 2 {print $4}')"
minimum_kib=$((25 * 1024 * 1024))
if [[ ! "$available_kib" =~ ^[0-9]+$ ]] || (( available_kib < minimum_kib )); then
  echo "::error::NsJail requires at least 25 GiB free on the Docker filesystem; available KiB: ${available_kib:-unknown}." >&2
  exit 1
fi
