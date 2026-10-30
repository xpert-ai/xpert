# @xpert-ai/headless-ui

## 0.1.2

### Patch Changes

- 1f1c7b7: Explain unavailable plugin marketplace details without assuming that a package is nonexistent or private. Preserve structured lookup errors, localize access and availability guidance in English and Chinese, and offer retry for transient failures while keeping navigation back to the marketplace available.
- 5449238: Reset generation parameters when changing model identities while retaining client retries and same-model overrides. Preserve numeric input drafts and commit edits before saving. Persist explicitly cleared optional parameters without restoring defaults or sending them in provider requests, including ModelExecution snapshots and native protocols.

## 0.1.1

### Patch Changes

- c5299e6: Align tag-select fields, selected chips and suggestions with the shared theme and compact input density. Keep Assistant sharing buttons at a consistent page-local height with responsive alignment.

## 0.1.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

## 0.0.2

### Patch Changes

- d107704: Add Assistant Profile display contracts and capability/activity indicators, trusted Assistant version identities, and the feature-gated Profile tab slot. Expose static Middleware Tool names and human Project access to plugin server services, and provide the shared Zard Hover Card interaction primitive.
