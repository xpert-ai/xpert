---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/xpert-ui': patch
---

Prepare the Xpert 3.18.5 patch release, including plugin-sdk.

Add knowledge document chunk token limits, question generation, automatic and
structure-aware chunking, spreadsheet table metadata, and format-specific scoped
parsers with diagnostics. Preserve OCR chunk limits and table context.

Extend MCP resource reads with scoped workspace files and the requested resource
URI, preserve confirmation sessions, and reauthorize queued execution. Add PPTX
preview and editing with binary workspace saves and edited downloads.

The target platform version is 3.18.5. Verify contracts, plugin-sdk, and xpert-ui
all resolve to this version in the release version PR, including changelogs,
internal dependency references, and lockfile entries.
