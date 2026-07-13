# Xpert Sandbox Runtime Suite

This private package is the single source of truth for Xpert Sandbox OCI images, provider-neutral Runtime Definitions, immutable Runtime Artifact catalogs, build metadata, and smoke tests. It does not contain Sandbox providers, job orchestration, capacity control, workspace mapping, or plugin business code.

The first image family is the Browser Runtime profile `browser/playwright-1.61/v1`. It supplies Node.js 20.20.2, Playwright 1.61.0, matching Chromium, CJK/Emoji fonts, and a generic Runner Host. Plugins contribute versioned Sandbox Action Bundles; they never select an image or pass a command.

## Add an image family

Add the family below `images/`, declare it once in `images/catalog.json`, and implement its manifest, Runtime Definition, Artifact Catalog template, Dockerfile, and smoke tests. Release workflows derive their build matrix only from the catalog.

## Local verification

```bash
corepack pnpm nx test sandbox-runtime
node packages/sandbox-runtime/scripts/build-matrix.mjs
docker build -f packages/sandbox-runtime/images/browser/Dockerfile -t xpert-sandbox-browser:local .
node packages/sandbox-runtime/scripts/verify-image.mjs --family browser --image xpert-sandbox-browser:local
```

The OSS Core always loads the Browser Runtime Definition. A development Docker Provider Binding selects `xpert-sandbox-browser:local` automatically, so no Profile Catalog or feature switch is required after this build. Presentation PDF/PPTX capability becomes available when a compatible Provider, Action Bundle, and `sandbox-browser` worker are healthy; otherwise health reports a concrete warning while HTML remains usable.

The release target is `linux/amd64`. On an ARM development host, build a native, local-only image with temporary tag-based `NODE_BASE_IMAGE` and `PLAYWRIGHT_BASE_IMAGE` build arguments, then pass `--platform linux/arm64` to `verify-image.mjs`. Release workflows always use the digest-pinned defaults from the Dockerfile.

Production Providers consume the released Runtime Artifact Catalog and must pin artifacts with `@sha256:`. Provider release CI turns those catalogs into its own immutable lock file. There is no production image/profile environment-variable override; mutable tags are aliases for development and release discovery only.

## Ownership boundary

- `@xpert-ai/sandbox-runtime`: Definition and artifact production.
- OSS Sandbox Jobs Core: Action validation, Job state, Binding selection, capacity, files, audit and health aggregation.
- Runtime Provider plugins: turn a compatible Binding into one isolated Runtime instance.
- Sandbox Action plugins: declare only an Action, version and required Runtime Profile.
