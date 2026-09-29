# Web build dependencies

The Web Docker build installs `.deploy/webapp/package.json` with its dedicated
`pnpm-lock.yaml`. Only Cloud, contracts, UI and Formly workspace manifests are
included. API, Desktop and optional server plugins are not installed.

Angular, Nx and their frontend native binaries (for example esbuild and SWC) are
still required. Server-only modules such as `node-pty`, `isolated-vm`, `sharp` and
FFmpeg, and Desktop/E2E downloads such as Electron and Cypress are excluded.

When adding a frontend dependency, declare it in the appropriate workspace
package. If it is a root dependency or build tool, also add it to this profile
using the same version as the root manifest. Do not copy all root dependencies.

```bash
corepack pnpm lockfile:update
corepack pnpm lockfile:check
node --test .deploy/webapp/dependencies.test.cjs
docker build --platform linux/amd64 --target candidate \
  -f .deploy/webapp/Dockerfile -t xpert-webapp:check .
node .deploy/webapp/check-image.cjs xpert-webapp:check
```

The lock maintenance commands and commit hook update both API profiles and this
Web profile. CI checks version alignment and rejects excluded native dependencies
even if they are introduced transitively.

The API-host terminal is preserved in the optional
[`local-shell-sandbox` plugin](../../packages/plugins/local-shell-sandbox/README.md).
Its dependency build requirements apply only to installations using that plugin.
