---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/server-core': patch
---

Add asynchronous knowledgebase automatic tagging with bounded document samples, numbered existing-label classification, strict server validation, model fallback, and idempotent incremental associations. Reuse organization/tenant Tag definitions with knowledgebase-scoped selection and preserve manual labels across concurrent classification and retries. Count explicit knowledge associations in the existing directory and protect referenced tags. Run standalone schema-sync before enabling the new code.
