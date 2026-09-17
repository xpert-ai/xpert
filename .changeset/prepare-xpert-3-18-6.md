---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/xpert-ui': patch
---

Prepare the Xpert 3.18.6 patch release, including plugin-sdk.

Extend decorated MCP capabilities and structured knowledge graph runtime contracts.
Improve document parsing and scanned-page understanding, semantic FAQ exclusion,
manual tags during document import, and per-knowledgebase vector storage selection.
Include schema-driven sliders and the scoped database workbench adapter.

The target platform version is 3.18.6. Verify contracts, plugin-sdk, and xpert-ui
all resolve to this version in the release version PR, including changelogs,
internal dependency references, and lockfile entries. Publish the separately
versioned Runtime Suite source images before creating platform-version aliases.
