# Xpert Sandbox Runtime Suite

This private package is the single source of truth for Xpert Sandbox OCI images, local Runtime assets, immutable Runtime Artifact catalogs, build metadata, and smoke tests. Provider-neutral Runtime Definitions are embedded in OSS Core so production API processes can perform capability discovery without installing this package. Runtime Suite tooling consumes those Definitions when validating images and producing release catalogs.

The first image family is the Browser Runtime profile `browser/playwright-1.61/v1`. It supplies Node.js 20.20.2, Playwright 1.61.0, matching Chromium, CJK/Emoji fonts, and a generic Runner Host. Plugins contribute versioned Sandbox Action Bundles; they never select an image or pass a command.

## Add an image family

Add the family below `images/`, declare it once in `images/catalog.json`, and implement its image manifest, Artifact Catalog template, Dockerfile, and smoke tests. Add its provider-neutral Runtime Definition to the OSS Core catalog and reference that file from `image.json`. Release workflows derive their build matrix only from the image catalog.

## Local verification

```bash
corepack pnpm --filter @xpert-ai/sandbox-runtime install:browser
corepack pnpm --filter @xpert-ai/sandbox-runtime verify:local-browser
corepack pnpm nx test sandbox-runtime
node packages/sandbox-runtime/scripts/build-matrix.mjs
docker build -f packages/sandbox-runtime/images/browser/Dockerfile -t xpert-sandbox-browser:local .
node packages/sandbox-runtime/scripts/verify-image.mjs --family browser --image xpert-sandbox-browser:local
```

The OSS Core always loads the Browser Runtime Definition, and the API consumes `sandbox-browser` at concurrency one. In `development` or `test`, it also registers the process-isolated `local-browser-runtime` Binding. No profile, image, `CHROME_PATH`, or feature switch is required. If the pinned Playwright browser is missing, health reports the `install:browser` command above. In production, this Binding is not registered and its methods fail closed; OSS correctly has no Browser Provider, while Pro registers its Docker Runtime Provider in the API process.

The release target is `linux/amd64`. On an ARM development host, build a native, local-only image with temporary tag-based `NODE_BASE_IMAGE` and `PLAYWRIGHT_BASE_IMAGE` build arguments, then pass `--platform linux/arm64` to `verify-image.mjs`. Release workflows always use the digest-pinned defaults from the Dockerfile.

Production Providers consume the released Runtime Artifact Catalog and must pin artifacts with `@sha256:`. Provider release CI turns those catalogs into its own immutable lock file. There is no production image/profile environment-variable override; mutable tags are aliases for development and release discovery only.

## CI and release flow

Application images and Runtime images intentionally use different workflows:

- `.github/workflows/docker-publish.yml` publishes only `xpert-api` and `xpert-webapp`.
- `.github/workflows/sandbox-runtime-publish.yml` owns Runtime image validation and candidate aliases.
- `.github/workflows/publish-npm-packages.yml` publishes immutable Runtime Suite version tags when `@xpert-ai/sandbox-runtime` is versioned.

Pull requests that touch `packages/sandbox-runtime/**` or Runtime Definitions build and smoke-test the affected image families but do not push images. Pushes to `develop` for the same paths build, smoke-test, and push only `develop-candidate` and `sha-<commit>` aliases. Platform git tags do not rebuild Runtime images; they create `xpert-<tag>` aliases for already-published Runtime Suite version tags.

## Ownership boundary

- `@xpert-ai/sandbox-runtime`: OCI image, local development Runner/browser dependency, manifest, artifact catalog, release metadata and smoke production; never a production API dependency.
- OSS Sandbox Jobs Core: Runtime Definitions, Action validation, Job state, Binding selection, capacity, files, audit and health aggregation.
- Runtime Provider plugins: turn a compatible Binding into one isolated Runtime instance.
- Sandbox Action plugins: declare only an Action, version and required Runtime Profile.
