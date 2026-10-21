---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Introduce one canonical Analytics source model and runtime for database connections, versioned Definitions and Artifacts. Add scoped configuration management and settings UI, and restrict DataSource Types to real database drivers. Remove versioned protocol adapters and migration inventory. Analytics plugins and saved documents must use the canonical source envelope; this release intentionally does not decode historical Bindings.

Use the shared JSON Schema form and Zard controls for Analytics settings, including nested schema references, union choices and JSON values. Fix the settings navigation icon.

Add scoped Agent definition authoring, provider inspection/preflight, and retry-safe immutable registration. Make Analytics settings a management-only surface.

Resolve unnamed MCP servers consistently between automatic definition discovery and the MCP runtime, and reject ambiguous normalized server identities.

Explain duplicate-grain validation failures to Agent tools without exposing upstream errors, enabling repair of search-result tables that contain multiple snippets per URL.
