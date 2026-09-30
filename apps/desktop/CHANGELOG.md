# @xpert-ai/desktop

## 0.2.0

### Minor Changes

- e4485ba: Release Bosi Desktop, API and Webapp together for configurable digital experts.

  Bosi can create blank assistants and edit their model, optional capabilities and instructions. Personal profile overrides remain local, while shared assistant settings require workspace edit access and take effect after publishing.

  Add an extensible Assistant capability registry, model and runtime compatibility checks, and configuration APIs with stale-edit protection. Keep cloud computer support in the Pro capability provider, and preserve existing workflow settings when managed capabilities change.

- cf671da: Add desktop update discovery, a sidebar download button with live progress, and explicit install/restart confirmation. Publish verified update feeds per operating system and architecture alongside stable release installers.
- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- 43d9c79: Default Bosi connections to the hosted Xpert API, Web and ChatKit deployments, and support customer-specific URLs embedded at build time through environment variables or a JSON file. Preserve saved connections and support API endpoints with or without the /api suffix.
- cbeb150: Fix Desktop installer builds when signing secrets are unset, keep Linux x64 artifact names consistent, and make Shell authorization tests independent of the build host's home directory.
- cccbc9d: Build Bosi installers for macOS, Windows and Linux on x64 and arm64 with Changesets-controlled candidate and stable releases.

  Complete Traditional Chinese and Japanese translations for local Shell permissions so release validation covers every supported language.

  Declare the document preview dependency required by standalone Desktop builds.

- 0d6f2d3: Support trusted private deployments with an opt-in connection setting for untrusted service certificates. Apply the setting only to configured API, Web and ChatKit hosts, including Desktop Shell connections, and reset connections when the policy changes.

  Check service certificates independently of this setting and show non-blocking warnings with specific certificate or network errors. Keep certificate warnings visible when connections are allowed, while preserving normal certificate validation by default.

- ce73ebe: Upgrade the shared ChatKit packages to 0.8.0 across the API, Web and Bosi desktop applications.
- Updated dependencies [99d09ec]
  - @xpert-ai/desktop-protocol@0.2.0
