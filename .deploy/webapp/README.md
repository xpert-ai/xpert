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

## Web build updates

`cloud:build` runs `prepare-web-release` to generate a new build ID in
`.cache/web-release`. Cloud compiles that ID into its bundle; both entry HTML
files and `/version.json` carry the same ID. Build output is not reused from Nx's
cache because the manifest and loaded bundle must agree. Development `serve`
also prepares these files, but automatic polling is enabled only in production.

HTML and the manifest use `no-store`. JS/CSS revalidate (`no-cache`), including
runtime-substituted JS. Missing bundles return 404. `ngsw-worker.js` is a
retirement worker at the historical URL and only removes Angular caches for its
own scope; `ngsw.json` returns 404. Neither login nor business storage is cleared.

Focused checks:

```sh
node --test .deploy/webapp/prepare-web-release.test.cjs
# Use a locally available Nginx image with curl; this does not pull an image.
WEB_UPDATE_NGINX_IMAGE=nginx:1.30.6 node --test .deploy/webapp/cache-policy.test.cjs
corepack pnpm exec jest --config apps/cloud/jest.config.ts --runInBand --testPathPatterns=web-update
```

The existing image check also verifies manifest/entry consistency, ChatKit update
capability, response headers and missing bundles. Manual acceptance: leave build A open, deploy B,
check the bottom-left notice, dismiss it, reopen About and update. Verify that
login and the current URL survive, then repeat with offline checks and rollback.
Already-open pages from before this feature need one initial refresh to acquire
the detector. These checks do not establish deployment or customer acceptance.

Standalone ChatKit updates need the matching `@xpert-ai/chatkit-ui` patch with
`xpert-web-update.json` in `dist/app`. Publish that package and update Cloud and
isolated Web dependency locks through the existing ChatKit dependency workflow
before a normal release. Until then, the build warns when the installed package
lacks this capability. For local integration without replacing installed packages:

```sh
# Build the ChatKit worktree's UI app first, then from the Xpert checkout:
CHATKIT_APP_SOURCE=/absolute/chatkit-worktree/packages/chatkit-ui/dist/app \
  corepack pnpm exec nx build cloud --configuration=production
```

The preparation step stages the complete selected ChatKit app, rewrites its
entry asset prefix and stamps the shared build identity. Angular and Docker both
consume these staged files; Docker must not overwrite them with a different copy
from node_modules. ChatKit assets remain available at both `/chatkit/assets` and
the existing `/assets` path used by Vite's lazy preload map. The source override
is local build integration, not publication.

Release staging also uses the existing ChatKit icon stylesheet helper, preserving
the local `/assets/chatkit-icons` font path after bundle URLs are rewritten.

Full-page updates call the current user editor, integration editor and prompt
workflow's existing leave checks, then ChatKit's `prepareLeave()`. Cancellation,
errors or a 15-second timeout keep the page open. Native `beforeunload` protection
remains in place for browser-level exits.
