#!/usr/bin/env bash

set -euo pipefail

# IDE auto-attach injects the Node inspector into every pnpm worker. Node 22 can
# crash inside V8 while inspecting those workers, so bootstrap runs uninspected.
unset NODE_OPTIONS
unset VSCODE_INSPECTOR_OPTIONS

corepack pnpm install
corepack pnpm nx build server
corepack pnpm nx build plugin-sdk
