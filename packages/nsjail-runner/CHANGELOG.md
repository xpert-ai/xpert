# @xpert-ai/nsjail-runner

## 0.2.2

### Patch Changes

- 1acb35c: Request a develop candidate for the NsJail runtime updates synchronized from main. Include the managed application-data verification script in the image and gate candidate publication on the image's protocol, isolation, and application-data checks.

## 0.2.1

### Patch Changes

- b8d81f7: Publish Runner protocol 3 with managed `.apps` data protection. Require an image Changeset for NsJail runtime changes and verify the published image's isolation, file channels and protected application data before updating candidate aliases.

## 0.2.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- 79cc75a: Publish application Docker images only for their own Changesets. Build scoped candidates, require consumed Changesets for stable releases, and check that shared package releases include their consuming applications.
