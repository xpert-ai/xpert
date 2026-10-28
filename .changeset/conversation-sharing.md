---
'@xpert-ai/xpert-api': minor
'@xpert-ai/xpert-ui': minor
'@xpert-ai/contracts': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/server-core': patch
'@xpert-ai/server-config': patch
'@xpert-ai/server-common': patch
---

Add revocable, expiring conversation text snapshots with organization membership checks, opt-in public links, a full-width Cloud viewer using ChatKit's read-only message list, preview validation, and bearer-token log protection. Project and group conversations cannot be exported. The shared renderer receives only authorized text and theme data, without live conversation credentials.

Add a personal shared-links settings dialog with search, pagination, owner-only snapshot previews, and confirmed single/bulk revocation. Management excludes delegated Assistant credentials and preserves conversations and shares created after the reviewed cutoff.

Persist conversation exports through existing Artifact containers, immutable ArtifactVersions and revocable ArtifactLinks. Reopening and copying reuse the stored URL. Enforce conversation source availability and export restrictions on shared Artifact content entrypoints, including raw URLs. No separate ConversationShare entity or token-recovery migration is introduced.

Keep conversation rules in conversation-sharing as a built-in Artifact type plugin with Artifact-owned share queries. The conversation feature module registers its type and host view directly, without a separate built-in plugin aggregation module. Register through the SDK type protocol, persist the installation binding, and reject unavailable types without fallback. The former host-only source-policy interface is removed.

Use the existing CLIENT_BASE_URL for share and management URLs, exposed through the shared clientBaseUrl bootstrap setting. Conversation sharing requires no feature-specific deployment configuration. Public sharing is available by default but still requires explicit owner confirmation; the default audience remains organization-only with a seven-day expiry.
