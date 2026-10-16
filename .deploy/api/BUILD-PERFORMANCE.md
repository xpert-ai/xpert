# API compilation

The Docker build uses `node .deploy/api/build.mjs` to schedule API and the three
built-in plugins in one Nx task graph, with two concurrent tasks. Dependency
targets retain full type checking. `server-ai:build-remote-components` owns all
remote UI outputs and waits for the plugin-sdk output consumed by coding-execution.
The three existing `api:build-*` UI commands delegate to that owner.

Production API Webpack uses compiled libraries; development keeps source builds.
`buildable-libraries.cjs` generates a shared
path-remapped tsconfig **before** Nx constructs its resolver, loader and type
checker. This is necessary with the pinned Nx 22 implementation: resolver-only
remapping would leave the checker traversing the original library sources.
Direct-JS workspaces retain their package-root resolution after compiled libraries
move to `dist`. Nest decorator metadata, type checking and `.cts` support remain.
The compatibility test runs in the Docker build; it must also pass on Nx upgrades.

## Reports

Each invocation writes `.nx/api-build/summary.json` (wall time, task times and
cache statuses) and `tasks.json` (Chrome trace). Executed API builds also write
`webpack.json` (duration, module count and remaining workspace TypeScript sources).
The TypeScript checker prints its parse/bind/check timings. Cached API builds do
not produce a new Webpack report; their historical compiler messages may be
replayed by Nx, so use task statuses to distinguish execution from restoration.
Reports stay in the build stage and are printed in CI logs, outside the runtime
image. Task times overlap; do not sum them to derive wall time.

## Before/after comparison

Use committed refs with the same API build dependency lock:

```sh
node .deploy/api/benchmark-build.mjs --baseline <before-sha> --candidate <after-sha> \
  --platform linux/arm64 --output /tmp/xpert-api-build-comparison
```

Use `linux/amd64` on an AMD64 host/runner (the default). The script extracts exact
Git snapshots into disposable directories and performs six Docker builds on the
same builder, retaining raw logs and `results.json`. It never edits the checkout
or publishes images. Keep other CPU-heavy work off that builder during comparison.

For each revision:

1. **Cold compilation:** invalidate the build stage; all compiler outputs and Nx
   task caches start empty. Dependency installation is excluded from compile time.
2. **API-only change:** append a harmless comment to `apps/api/src/main.ts`, reusing
   available Docker layers from the previous build.
3. **server-ai-only change:** restore API source, append a harmless comment to
   `packages/server-ai/src/index.ts`, and rebuild with available Docker layers.

Compilation is the elapsed Docker RUN time of plugins + API in the legacy build,
or the unified RUN in the optimized build. Docker elapsed time is recorded
separately and includes context transfer, dependency work and runtime assembly;
it is not a pure compiler comparison. Failed/cached compilation steps cannot be
reported as successful measurements.

These are the current Docker CI semantics: a source COPY change invalidates the
compile layer, so project-level Nx caches are **not** reused across changed-source
Docker builds. Registry layer caching does not export a mutable Nx cache. Faster
local rebuilds with a retained `.nx` directory must be reported separately. A future
remote task cache would be an additional optimization, not a benefit of this change.
