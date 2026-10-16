---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Expose configuration tabs for existing MCP Publication plugin sources and a typed MCP view-host context. Preserve schema UI metadata, mask saved secrets and reject stale saves. Enable the existing view-extension slot on MCP service pages without changing ordinary toolset registration or installation.

Allow native providers to validate connection values before persistence. Preserve array secrets by their source reference when entries are moved or removed, and reject ambiguous or mismatched references. Avoid eager tag joins when locking connection rows on PostgreSQL.

Allow administrators to delete disabled MCP services after confirmation, clearing publication records and installation references while retaining source plugins and tools. Removing shared-service admission in an organization only removes that organization's access and records.
