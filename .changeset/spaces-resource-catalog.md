---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/server-core': patch
---

Add a Project-scoped content catalog with explicit model and edit-protocol compatibility, editor preferences, safe source fallback and revision-bound search projections. Resolve stable catalog identities to authorized plugin selections, permit on-demand Project editor discovery independently of Assistant tools, and authorize Project-owned Artifact drafts through current member rights.

Provide a reusable Assistant capability composition helper. Preserve unacknowledged and offline collaboration updates across reconnects, invalidate pre-archive CAS revisions on restore, and admit direct chat runs before persisting recovery checkpoints. Requires coordinated host, SDK, ChatKit and resource-plugin deployment.

Keep failed collaboration projections retryable: reject failed queue attempts, recover stale durable checkpoints after restart, and replay only the latest active document state without requiring an open browser.

Return explicit access/unavailability errors for stale client actions after a resource provider is uninstalled, while preserving authorized read-only source backups.

Reuse the shared I18nObject contract for content type and implementation labels instead of introducing a separate mandatory bilingual shape.

Persist credential-free, immutable create/copy intents and recover them after restart. Reconcile source projections and notify knowledge observers using current Project membership and Assistant access. Add revision-checked Artifact draft recycling that revokes shares atomically; restoring a draft never republishes previous links. Apply `20261026_content_operations.sql` before enabling the maintenance worker.
