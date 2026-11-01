---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Allow channel plugins to supply stable chat source identifiers through the shared TChatFrom and RunSource contracts without adding each provider to the platform's literal list. Accept nonempty producer identifiers in handoff routing configuration while preserving exact source, tenant, and organization matching. Keep legacy source values and persisted conversation attribution unchanged, and let the agent chat dispatch contract inherit the shared source type. Existing channel plugins require no payload migration; new plugins need the updated contracts when compiling. Source attribution remains separate from execution identity and authorization.
