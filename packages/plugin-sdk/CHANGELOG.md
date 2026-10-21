# @xpert-ai/plugin-sdk

## 3.26.0

### Patch Changes

- Updated dependencies [f0590e2]
- Updated dependencies [23b505e]
- Updated dependencies [d3ad3a5]
  - @xpert-ai/contracts@3.26.0

## 3.25.0

### Minor Changes

- 3e0460d: Align the core platform packages on a shared release line. API, Cloud, Contracts, SDK and server foundations move together to the next minor version.
- 1b5096f: Validate provider credentials before saving by reusing model discovery when supported, or by testing a user-selected model or endpoint. Expose an optional SDK validation policy and typed preview API, show discovered models and actionable authentication errors, and repeat validation on save without persisting the test target.
- 1cd5a33: Expose a governed REST client runtime for enabled read-only operations on existing OpenAPI connections. Reuse platform credentials and permissions, pin operation contracts, and bound JSON transport without redirects.

### Patch Changes

- 4ff6010: Use the resolved model context window consistently for primary calls and context compression. Preserve explicit provider limits and remove model-name guesses that can incorrectly reject summary input for custom endpoints.
- 8a0c256: Expose configuration tabs for existing MCP Publication plugin sources, rendered from each bound provider's `configSchema`. Preserve schema UI metadata, mask saved secrets and reject stale saves without changing ordinary toolset registration or installation.

  Allow native providers to validate connection values before persistence. Preserve array secrets by their source reference when entries are moved or removed, and reject ambiguous or mismatched references. Avoid eager tag joins when locking connection rows on PostgreSQL.

  Allow administrators to delete disabled MCP services after confirmation, clearing publication records and installation references while retaining source plugins and tools. Removing shared-service admission in an organization only removes that organization's access and records.

- Updated dependencies [3e0460d]
- Updated dependencies [babce0b]
- Updated dependencies [c2b52ba]
- Updated dependencies [ba77738]
- Updated dependencies [0f55121]
- Updated dependencies [8a0c256]
- Updated dependencies [854a4c0]
- Updated dependencies [1b5096f]
  - @xpert-ai/contracts@3.25.0

## 3.24.0

### Minor Changes

- 2e7af88: Expose McpClientRuntimeApi (platform.mcp.client) for governed access to existing MCP connections. Initially tools.list/call enforce read-only selection, current-viewer authorization, pinned schema contracts and execution limits.

## 3.23.1

### Patch Changes

- Updated dependencies [c4f9bb3]
  - @xpert-ai/contracts@3.23.0

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
