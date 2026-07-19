# Xpert Sandbox Runtime Suite

This private package is the single source of truth for Xpert Sandbox OCI images, local Runtime assets, immutable Runtime Artifact catalogs, build metadata, and smoke tests. Provider-neutral Runtime Definitions are embedded in OSS Core so production API processes can perform capability discovery without installing this package. Runtime Suite tooling consumes those Definitions when validating images and producing release catalogs.

The suite contains three provider-neutral profiles. `browser/playwright-1.61/v1` supplies Node.js 20.20.2 for general browser automation. `browser/ai-playwright-1.61/v1` adds an immutable, hash-verified AI resource catalog (initially multilingual `Xenova/whisper-tiny:q4` and ONNX Runtime Web) without putting models in plugin packages. `browser/video-playwright-1.61/v1` supplies Node.js 22.17.1, Playwright 1.61.0 with matching Chromium, FFmpeg 6.1, CJK/Emoji fonts, and larger media-oriented resource limits. All profiles use the same generic Runner Host. Plugins contribute versioned Sandbox Action Bundles; they never select an image or pass a command.

## Add an image family

Add the family below `images/`, declare it once in `images/catalog.json`, and implement its image manifest, Artifact Catalog template, Dockerfile, and smoke tests. Add its provider-neutral Runtime Definition to the OSS Core catalog and reference that file from `image.json`. Release workflows derive their build matrix only from the image catalog.

## Local verification

```bash
corepack pnpm --filter @xpert-ai/sandbox-runtime install:browser
corepack pnpm --filter @xpert-ai/sandbox-runtime install:ai
corepack pnpm --filter @xpert-ai/sandbox-runtime verify:local-browser
corepack pnpm nx test sandbox-runtime
node packages/sandbox-runtime/scripts/build-matrix.mjs
docker build -f packages/sandbox-runtime/images/browser/Dockerfile -t xpert-sandbox-browser:local .
node packages/sandbox-runtime/scripts/verify-image.mjs --family browser --image xpert-sandbox-browser:local
docker build -f packages/sandbox-runtime/images/browser-ai/Dockerfile -t xpert-sandbox-browser-ai:local .
node packages/sandbox-runtime/scripts/verify-image.mjs --family browser-ai --image xpert-sandbox-browser-ai:local
docker build -f packages/sandbox-runtime/images/browser-video/Dockerfile -t xpert-sandbox-browser-video:local .
node packages/sandbox-runtime/scripts/verify-image.mjs --family browser-video --image xpert-sandbox-browser-video:local
```

The OSS Core always loads the Runtime Definitions, and the API consumes compatible Bindings at their configured concurrency. In `development` or `test`, it also registers process-isolated `local-browser-runtime` Bindings. No profile, image, `CHROME_PATH`, or feature switch is required. If the pinned Playwright browser is missing, health reports the matching install command above. `browser-ai` health deliberately does not download resources: the first AI Sandbox creation installs the fixed catalog into the versioned XDG cache with single-flight concurrency, while `install:ai` prewarms it. In production, local Bindings are not registered and their methods fail closed; Pro registers its Docker Runtime Provider in the API process.

The release target is `linux/amd64`. On an ARM development host, build a native, local-only image with temporary tag-based `NODE_BASE_IMAGE` and `PLAYWRIGHT_BASE_IMAGE` build arguments, then pass `--platform linux/arm64` to `verify-image.mjs`. Release workflows always use the digest-pinned defaults from the Dockerfile.

Production Providers consume the released Runtime Artifact Catalog and must pin artifacts with `@sha256:`. Provider release CI turns those catalogs into its own immutable lock file. There is no production image/profile environment-variable override; mutable tags are aliases for development and release discovery only.

Docker Provider health only validates an already-cached image. A missing digest-pinned `browser-ai` image is reported as cold-start capable and is pulled only when the first matching Sandbox is created; concurrent first jobs share one pull. Operators can remove that first-job latency by pulling the exact digest from the provider runtime lock before accepting traffic.

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
