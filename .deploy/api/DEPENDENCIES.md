# Runtime dependency migration

## Stage 1: shared versions and workspace lock validation

All direct `@xpert-ai/chatkit-types` declarations use the default catalog in
`pnpm-workspace.yaml`. The catalog currently pins an exact version. Update it
and regenerate the lockfile together:

```sh
corepack pnpm run lockfile:update
corepack pnpm run lockfile:check
node --test .deploy/api/*.test.cjs tools/release/catalog-dependencies.test.mjs
```

The dependency workflow validates the workspace lock without changing local
`node_modules`. The Web image uses `--frozen-lockfile`, because it installs from
the repository root manifest. The custom npm publishing scripts expand catalog
references before publishing build outputs; consumers do not need our catalog.

## Stage 2: frozen API deployment installs

Overrides now have one source of truth in `pnpm-workspace.yaml`. The repository
root and deployment manifests no longer define `pnpm.overrides`. API Docker
stages and the local packaging script copy the workspace configuration alongside
their root manifest. The existing lockfile already records all twelve rules,
including `ws` and `zod-to-json-schema`, so this consolidation preserves the
repository's resolved dependency graph.

The legacy `.deploy/webapp/package.json` is not used by the current build scripts
or Dockerfile. Its overrides were removed without promoting its old ChatKit
web-component and minimatch pins to workspace-wide policy.

The root importer differs between build and production, so the API uses two
committed deployment locks: `pnpm-lock.build.yaml` and
`pnpm-lock.production.yaml` in this directory. Both use the shared catalog,
overrides, and source package dependency declarations. The build profile also
includes `apps/api/package.json`. `dependencies.cjs` defines the package set;
keep the Docker manifest COPY list aligned when adding workspace packages.

`dependencies.cjs update` regenerates both locks in temporary manifest-only
workspaces without touching local `node_modules`. `dependencies.cjs check`
validates both profiles offline with pnpm's frozen-lockfile check. CI runs this
check. The root `lockfile:update`, Changesets version command, and dependency
pre-commit hook maintain the deployment locks alongside the workspace lock.

`dependencies.cjs prepare-runtime <new-directory>` assembles real compiled
outputs using their generated entry points and source dependency declarations.
It preserves the nested publish roots of contracts/plugin-sdk and includes the
uncompiled desktop-protocol JavaScript package. Docker and local packaging use
the same assembly path. Missing outputs, mismatched package versions, or
compiler-added dependencies missing from source declarations fail.
Docker validates the assembled layout, then installs production dependencies
with `--frozen-lockfile`; its build-stage installs use the build lock likewise.

Do not generate or repair deployment locks during the image build: the resolved
dependency graph must be reviewed with the source changes.

## Acceptance: build, startup, and health

The acceptance criterion is a successful production image build followed by
normal startup and healthy HTTP endpoints. There is no ChatKit export checklist
or additional business-path smoke suite. Catalog and frozen-lock checks remain.

```sh
corepack pnpm run api:image:check
```

This builds the production image, then checks `/api/health/ready` and
`/api/health` in a disposable Compose project with its own Postgres and Redis.
It publishes no host ports, uses generated temporary secrets, and removes only
its own containers and volumes afterward. Existing services and `.env` files
are untouched. API/database/cache/Redis must all be healthy. On failure, private
diagnostic paths are printed; application logs are not streamed to CI output.

To check an already-built image:

```sh
node .deploy/api/check-image.cjs xpert-api:health-check
```

The dependency workflow performs the same build/start/health check on Linux
AMD64. The image also includes a Docker healthcheck for normal deployments.
Health proves startup and required infrastructure connectivity, not every
business operation or plugin's readiness.
