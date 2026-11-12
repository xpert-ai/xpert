---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Provide a host-owned conversation resource directory for current Project content and accepted references in the exact group audience. Add semantic type, origin and cursor filters to Resource Assistant discovery, and support authorized Project content navigation in group conversations. Revalidate runtime membership, project binding and reference grants without copying shared resources into Project catalogs.

Reuse the canonical resource locator in group links and live navigation events. Normalize historical flat reference/content IDs when reading persisted messages, while new messages use only `resource.kind` and `resource.id`.
