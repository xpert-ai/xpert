---
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
---

Provide a shared CQRS entry point for resolving user organization access, keeping role-specific access policy out of business callers. Add a reusable Zod request-validation pipe and skip plugin schema synchronization when a plugin declares no entities.
