# @xpert-ai/xpert-api

## 3.10.0

### Minor Changes

- e4485ba: Release Bosi Desktop, API and Webapp together for configurable digital experts.

  Bosi can create blank assistants and edit their model, optional capabilities and instructions. Personal profile overrides remain local, while shared assistant settings require workspace edit access and take effect after publishing.

  Add an extensible Assistant capability registry, model and runtime compatibility checks, and configuration APIs with stale-edit protection. Keep cloud computer support in the Pro capability provider, and preserve existing workflow settings when managed capabilities change.

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- 79cc75a: Publish application Docker images only for their own Changesets. Build scoped candidates, require consumed Changesets for stable releases, and check that shared package releases include their consuming applications.
- ce73ebe: Upgrade the shared ChatKit packages to 0.8.0 across the API, Web and Bosi desktop applications.
- 7108a25: Publish API and Web candidates together for the shared execution-navigation contract changes.

## 3.9.0
