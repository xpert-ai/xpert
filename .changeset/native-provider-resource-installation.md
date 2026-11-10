---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Allow loaded native Tool Providers to be discovered, installed and listed from the scoped runtime registry without requiring a portable resource manifest. Preserve runtime registration versions and per-Agent selectors, require a valid plugin root for filesystem resources, and retain loaded-plugin scope and provider provenance checks.
