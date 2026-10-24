# Web build dependencies

The Web Docker build installs `.deploy/webapp/package.json` with its dedicated
`pnpm-lock.yaml`. Only Cloud, contracts, the browser-safe Desktop protocol, UI and
Formly workspace manifests are included. The audio-capture protocol supplies the
browser recorder's runtime validation and TypeScript declarations. API, the Desktop
application and optional server plugins are not installed.

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

## Independently hosted ChatKit pets

Cloud stages pet resources before both `nx build cloud` and `nx serve cloud`.
The generated `.cache/chatkit-pets` directory is copied to `/pets`; Nginx returns
404 for missing resources instead of returning the application HTML.

Cloud explicitly installs the pinned `@xpert-ai/chatkit-assets` package as a build
dependency. Both the workspace and isolated Web build lock include it, so standard
builds serve pets locally without downloading images at runtime. The UI package
does not depend on this resource package.

For an offline deployment, the installed package can be replaced by either source:

1. Extract the separately versioned `@xpert-ai/chatkit-assets` archive, then copy
   its `package/pets` directory to `.deploy/webapp/pet-assets/pets`. This directory
   is ignored by Git and included by the Docker build. It works before publication
   and requires no new package registry resolution or runtime network.
2. For a non-Docker build, set `CHATKIT_PETS_SOURCE` to an extracted `pets` directory.

During migration the preparer can also read `dist/app/pets` from older ChatKit UI
packages. If no complete local pack is present, a local-mode build fails with an
actionable error; it does not silently ship missing images.

```sh
# Before publication, build the standalone tarball in the chatkit-js workspace:
# corepack pnpm --filter @xpert-ai/chatkit-assets pack --pack-destination /tmp/chatkit-release
mkdir -p .deploy/webapp/pet-assets
tar -xzf /tmp/chatkit-release/xpert-ai-chatkit-assets-0.1.0.tgz \
  -C .deploy/webapp/pet-assets --strip-components=1 package/pets
node .deploy/webapp/prepare-chatkit-pets.cjs
```

Xpert uses ChatKit's default `/pets` resource path. There is no pet resource URL
setting or runtime environment substitution; every build provisions offline assets
for that path. The ChatKit SDK separately supports `pet.assetsBaseUrl` for other
integrations that host resources elsewhere.

Use the existing `corepack pnpm deps:update:chatkit` workflow after the matching
releases are published. Update the separately pinned resource package only when
its contents change, and regenerate the workspace and isolated Web locks together.

```sh
node --test .deploy/webapp/prepare-chatkit-pets.test.cjs .deploy/webapp/dependencies.test.cjs
```
