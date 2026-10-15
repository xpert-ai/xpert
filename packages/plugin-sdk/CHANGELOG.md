# @xpert-ai/plugin-sdk

## 3.23.0

### Minor Changes

- 616bab6: Add the SandboxWorkspaceMount contract and optional workspaceMounts provider creation option for mounts resolved after application authorization. Include conversation scope in application-side Sandbox acquisition and cache identity without forwarding business authorization context to providers.

### Patch Changes

- Updated dependencies [5afe7d1]
- Updated dependencies [94dd967]
- Updated dependencies [8ecf7b0]
- Updated dependencies [94dd967]
- Updated dependencies [616bab6]
- Updated dependencies [ddeb74f]
  - @xpert-ai/contracts@3.22.0

## 3.22.2

### Patch Changes

- 4e29238: Resolve Agent Plugin connector definitions from persisted tenant and organization configuration so catalogs, OAuth callbacks and runtime calls work across API replicas and restarts. Preserve historical connector identities and authentication methods when a native provider replaces generic MCP OAuth.

  Allow supported connectors to select or create a system integration in the connection dialog, remember its ID for reconnects, and resolve application credentials using the connection's persisted scope. Generate integration names automatically and deduplicate retries. GitHub requires the companion GitHub Connector plugin update to expose this flow and replace dynamic client registration.

- Updated dependencies [3b7f2cd]
  - @xpert-ai/contracts@3.21.3

## 3.22.1

### Patch Changes

- 558b1cd: Add provider model discovery and incremental imports for LLM, embedding, and rerank models. Preserve edited configuration across synchronization, expose model sources and editable limits, and apply the synchronized catalog to model selection and execution access.
- Updated dependencies [f60db7b]
- Updated dependencies [558b1cd]
  - @xpert-ai/contracts@3.21.2

## 3.22.0

### Minor Changes

- 795f24a: Unify managed Assistant application state under WorkspaceFilesRuntimeCapability.appData(). Resolve namespaces from loaded plugin metadata; revalidate the current actor and published Assistant on every operation. Shared workspaces remain supported unless the application requires user isolation. Reuse atomic Volume writes and shared-filesystem locks, and protect .apps from generic Files, downloads, parser inputs and sandbox file uploads. Preserve Studio draft access through explicit authoring authority.

  NsJail Runner protocol 3 masks .apps with an empty read-only mount and blocks file RPC access. Upgrade the Runner before the API; older Runners fail closed. Local Shell is trusted development execution and does not provide OS isolation. No old application data is migrated.

  Pin application handles to their original workspace, and reject private file projections after a switch to shared storage. Renew lock leases only after successful filesystem heartbeats, verify lock ownership before mutations, and preserve replacement owners on release. Reject root aliases into managed data and protect managed descendants during recursive deletion.

### Patch Changes

- a2e5e2c: Check required permissions by membership instead of counting matching role records. Duplicate enabled grants no longer deny Project catalogs or substitute for a different missing permission. Apply the same behavior to the server and Plugin SDK request contexts.
- 672810f: Preserve authorized MCP App results after interactive sessions expire and allow explicit recovery without rerunning the original tool. Recheck current message, Assistant and connector access, prevent stale replicas from replacing renewed sessions, and remove saved history with its owning conversation or messages.

  Expose a server-only View middleware runtime capability so plugins can reuse authorized Assistant configuration and connector bindings without inventing an Agent execution. Redact session credentials from HTTP request URLs and query logs.

  When TypeORM schema synchronization is disabled, apply `packages/server-ai/src/mcp-app-runtime/migrations/20261012-mcp-app-history.sql` before deploying the history and recovery endpoints.

- Updated dependencies [e42fc94]
- Updated dependencies [7de8eae]
- Updated dependencies [f304e7b]
- Updated dependencies [d9db433]
- Updated dependencies [f816d25]
  - @xpert-ai/contracts@3.21.1

## 3.21.1

### Patch Changes

- ae1fb5f: Add scoped knowledgebase discovery, readiness and action-permission APIs with authorization-aware cursor pagination. Preserve the legacy list behavior with deprecation guidance, and fail indexing when supplied generated-image semantics are invalid instead of indexing placeholder content.

  Clarify runtime and provisioning API responsibilities, and organize the SDK guides into English documentation with updated navigation, branding, package assets and cross-references.
